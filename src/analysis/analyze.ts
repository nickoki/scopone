/**
 * Analyses one decision of one player: how good was the move they played,
 * compared with every other legal move, judged ONLY on what they could know.
 *
 * Method: sample many possible deals of the cards the player could not see
 * (consistent with everything public so far), play each candidate move on the
 * same deals and average the hand's final point difference. Sampling
 * concentrates on the moves that matter (the one played and the best few)
 * until their difference is known precisely enough.
 */
import { createMoveSampler, exactKnowledge, track } from '../ai/difficile';
import { bestByHeuristic, naiveKnowledge, pNextHas } from '../ai/heuristics';
import {
  HIDDEN,
  SCORE_CATEGORIES,
  isDenari,
  makeRng,
  type HandState,
  type Move,
  type PlayedMove,
  type Rules,
  type ScoreCategory,
  type Seat,
} from '../engine';
import { candidatesFor, explainedLimit, factsFor, praiseFor, reasonsFrom } from './facts';
import { moveIndices, positionBefore, positionOf, type Decision } from './positions';
import {
  BRILLIANT_MARGIN,
  EVEN_SPREAD,
  GOOD_LIMIT,
  MATCH_DECIDED,
  accuracyOf,
  classCounts,
  classOf,
  creditedLoss,
  handScore,
  limitedLoss,
  weightOf,
} from './scoring';
import type { AnalysedMove, AnalysedOption, HandReview, MoveReview } from './types';

export interface AnalysisBudget {
  /** Deals played for every legal move. */
  first: number;
  /** Extra deals per round for the contending moves. */
  batch: number;
  /** Most deals any move gets. */
  max: number;
  /** Stop once the difference between the best move and the one played is known to this precision (points). */
  precision: number;
  /** When the hidden cards can be dealt in at most this many ways, go through every deal instead of sampling. */
  exhaustive: number;
}

export const DEFAULT_BUDGET: AnalysisBudget = { first: 200, batch: 200, max: 2400, precision: 0.045, exhaustive: 600 };
// There is deliberately no lighter budget for slow devices: fewer deals mean a
// larger margin of error, which the scoring forgives, so a cheaper analysis
// would be a more lenient marker. The budget is part of the marking scale.

const sameMove = (a: Move, b: { card: number; captured: number[] }) =>
  a.card === b.card && a.capture.length === b.captured.length && a.capture.every((c) => b.captured.includes(c));

const mean = (xs: readonly number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

/**
 * Mean and standard error of a[k] - b[k]. Entry k of every move is the same
 * deal (all moves share the first batch, contenders share the later ones), so
 * the comparison runs over the deals both moves were played on.
 */
function paired(a: readonly number[], b: readonly number[]): { d: number; se: number } {
  const n = Math.min(a.length, b.length);
  if (n === 0) return { d: 0, se: Infinity };
  let sum = 0;
  let sq = 0;
  for (let k = 0; k < n; k++) {
    const x = a[k]! - b[k]!;
    sum += x;
    sq += x * x;
  }
  const d = sum / n;
  return { d, se: Math.sqrt(Math.max(0, sq / n - d * d) / n) };
}

/**
 * How much the played move gives up against the best one, without the bias of
 * "the best of several noisy averages always looks better than it is".
 *
 * The deals are split in two halves. The best move is chosen on one half and
 * the gap to the played move is measured on the other, and vice versa; the two
 * measurements are averaged. A move that only looks best by luck in one half
 * shows no advantage in the other, so the truly best move is not charged.
 * All `contenders` must have been played on the same deals as `played`.
 */
export function crossFittedLoss(values: readonly (readonly number[])[], contenders: readonly number[], played: number): { loss: number; se: number } {
  const n = values[played]!.length;
  if (n < 4) return { loss: 0, se: Infinity };
  const halfMean = (i: number, parity: number) => {
    let sum = 0;
    let count = 0;
    for (let k = parity; k < n; k += 2) {
      sum += values[i]![k]!;
      count++;
    }
    return sum / count;
  };
  const leader = (parity: number) => contenders.reduce((a, b) => (halfMean(b, parity) > halfMean(a, parity) ? b : a));
  const gapOn = (best: number, parity: number) => {
    let sum = 0;
    let sq = 0;
    let count = 0;
    for (let k = parity; k < n; k += 2) {
      const x = values[best]![k]! - values[played]![k]!;
      sum += x;
      sq += x * x;
      count++;
    }
    const d = sum / count;
    return { d, v: Math.max(0, sq / count - d * d) / count };
  };
  // chosen on the even deals, measured on the odd ones - and the other way round
  const a = gapOn(leader(0), 1);
  const b = gapOn(leader(1), 0);
  return { loss: (a.d + b.d) / 2, se: 0.5 * Math.sqrt(a.v + b.v) };
}

/** A seed that depends only on the position, so the same decision always gets the same analysis. */
function seedFor(pos: HandState, seat: number): number {
  let h = 0x811c9dc5 ^ seat;
  const mix = (v: number) => {
    h = Math.imul(h ^ (v + 1), 0x01000193);
  };
  for (const c of pos.hands[seat]!) mix(c);
  mix(99);
  for (const c of pos.table) mix(c);
  mix(98);
  for (const m of pos.history) mix(m.card);
  return h | 0;
}

/** The verdict of one way of valuing the moves. */
interface Judgement {
  /** Index (into the sampler's moves) of the best move. */
  best: number;
  loss: number;
  se: number;
  credited: number;
  /** The outcomes this judgement is based on. */
  vals: readonly (readonly number[])[];
  ev: (i: number) => number;
}

/**
 * Analyse the move `played` in position `pos` (the mover's own view, as built
 * by `positionBefore`). Other hands are masked again here, so even a caller
 * holding the real cards cannot leak them into the result.
 */
export function analysePosition(
  pos: HandState,
  rules: Rules,
  played: PlayedMove,
  index: number,
  budget: AnalysisBudget = DEFAULT_BUDGET,
  /** The match score before this hand (public). With it, a move is not blamed for points that do not cost the match. */
  scores?: readonly [number, number],
): AnalysedMove {
  const seat = played.seat;
  const view: HandState = {
    ...pos,
    hands: pos.hands.map((h, s) => (s === seat ? h.slice() : h.map(() => HIDDEN))),
  };
  const sampler = createMoveSampler(view, seat, rules, makeRng(seedFor(view, seat)), scores);
  const { moves, values } = sampler;
  const playedIdx = moves.findIndex((m) => sameMove(m, played));
  if (playedIdx < 0) throw new Error('analysis: the played move is not legal in the rebuilt position');

  // What the others did since this player's previous move.
  let from = 0;
  for (let i = view.history.length - 1; i >= 0; i--) {
    if (view.history[i]!.seat === seat) {
      from = i + 1;
      break;
    }
  }
  const base = {
    index,
    seat: seat as Seat,
    hand: view.hands[seat]!.slice(),
    table: view.table.slice(),
    since: view.history.slice(from).map(({ seat: who, card, captured, scopa }) => ({ seat: who, card, captured, scopa })),
  };

  const all = moves.map((_, i) => i);
  const forced = moves.length === 1;

  // Few hidden cards left: every possible deal is played once, so the averages are exact.
  const exhaustive = !forced && sampler.exhaust(budget.exhaustive);
  if (!forced && !exhaustive) sampler.sample(all, budget.first);
  if (forced) sampler.sample(all, Math.min(60, budget.first)); // only for the facts shown with the move

  // Keep sampling only the played move and the moves that could be the best one.
  const mainEv = (i: number) => mean(values[i]!);
  const ranked = [...all].sort((a, b) => mainEv(b) - mainEv(a));
  const top = mainEv(ranked[0]!);
  const contenders = exhaustive || forced ? all : [...new Set([playedIdx, ...ranked.filter((i, k) => k < 4 && mainEv(i) >= top - 0.6)])];

  /** Judge the played move with one set of outcomes (exact search, or heuristic playouts). */
  const judge = (vals: readonly (readonly number[])[]): Judgement => {
    const ev = (i: number) => mean(vals[i]!);
    const best = contenders.reduce((a, b) => (ev(b) > ev(a) ? b : a));
    let loss: number;
    let se: number;
    if (best === playedIdx && exhaustive) ({ loss, se } = { loss: 0, se: 0 });
    else if (exhaustive) ({ loss, se } = { loss: Math.max(0, ev(best) - ev(playedIdx)), se: 0 });
    else ({ loss, se } = crossFittedLoss(vals, contenders, playedIdx));
    loss = Math.max(0, loss);
    return { best, loss, se, credited: creditedLoss(loss, se), vals, ev };
  };

  let main = judge(values);
  while (!forced && !exhaustive && values[playedIdx]!.length + budget.batch <= budget.max) {
    if (main.best === playedIdx) {
      // Done when every rival is clearly behind.
      const clear = contenders.every((c) => {
        if (c === playedIdx) return true;
        const g = paired(values[playedIdx]!, values[c]!);
        return g.d > 3 * g.se;
      });
      if (clear) break;
    } else if (main.se <= budget.precision || main.loss - 3 * main.se > 1.2) {
      break; // precise enough, or unmistakably a blunder
    }
    sampler.sample(contenders, budget.batch);
    main = judge(values);
  }

  // In the last three rounds the exact search sees all four hands, which no
  // player can: a move must also look wrong to the ordinary playout before it
  // is held against the player. The more lenient of the two judges decides.
  let verdict = main;
  if (sampler.exact && !forced) {
    const honest = judge(sampler.playoutValues);
    if (honest.credited < main.credited) verdict = honest;
  }
  const { best, loss, se } = verdict;
  const ev = verdict.ev;

  // ---- the options, with the facts the explanations are built from
  const kn = exactKnowledge(view, seat, track(view, seat));
  const drawn = sampler.deals.count;
  // One model for the odds: the share of the evaluation's own deals in which the next player holds the rank.
  const nextHolds = (rank: number) => (drawn > 0 ? sampler.deals.nextHolds[rank]! / drawn : pNextHas(kn, rank));
  const option = (i: number): AnalysedOption => {
    const n = sampler.playoutValues[i]!.length;
    const cats = {} as Record<ScoreCategory, number>;
    for (const c of SCORE_CATEGORIES) cats[c] = round3(n > 0 ? sampler.categorySums[i]![c] / n : 0);
    const nf = sampler.near[i]!;
    // How far behind the best move, on the deals both were played on (moves that
    // were dropped early are compared on the first batch only, so with more noise).
    const behind = i === best ? { d: 0, se: 0 } : paired(verdict.vals[best]!, verdict.vals[i]!);
    return {
      move: moves[i]!,
      ev: round3(ev(i)),
      delta: 0 - round3(Math.max(0, behind.d)),
      // For the move played, "too small to count" is exactly "nothing is held against it".
      even: i === best || (i === playedIdx ? verdict.credited === 0 : exhaustive ? behind.d < 0.005 : behind.d <= 2 * behind.se),
      samples: values[i]!.length,
      byCategory: n > 0 ? cats : null,
      near:
        n > 0
          ? {
              oppScopa: round3(nf.oppScopa / n),
              ownScopa: round3(nf.ownScopa / n),
              oppSettebello: round3(nf.oppSettebello / n),
              ownSettebello: round3(nf.ownSettebello / n),
              oppLaid: round3(nf.oppLaid / n),
            }
          : null,
      facts: factsFor(view, seat, rules, moves[i]!, kn.others, nextHolds),
    };
  };

  if (forced) {
    return { ...base, options: [option(0)], played: 0, loss: 0, se: 0, credited: 0, stake: 0, weight: 0, accuracy: 100, cls: 'forced', reasons: [] };
  }

  // Best first; then by how far behind it each move is.
  const built = all.map(option);
  const order = [...all].sort((a, b) => {
    if (a === best) return -1;
    if (b === best) return 1;
    return built[b]!.delta - built[a]!.delta || a - b;
  });
  const options = order.map((i) => built[i]!);
  const playedPos = order.indexOf(playedIdx);
  // What an average choice among the legal moves gives up here.
  const stake = Math.max(0, -mean(built.map((o) => o.delta)));

  // Nothing at stake: every legal move is worth the same (within a hair), so there was nothing to get right.
  const spread = Math.max(...built.map((o) => -o.delta));
  if (spread < EVEN_SPREAD && verdict.credited === 0) {
    return { ...base, options, played: playedPos, loss: 0, se: 0, credited: 0, stake: 0, weight: 0, accuracy: 100, cls: 'forced', reasons: [], even: true };
  }

  let credited = verdict.credited;
  const decided = {
    carte: Math.max(view.captured[0].length, view.captured[1].length) >= 21,
    denari: Math.max(view.captured[0].filter(isDenari).length, view.captured[1].filter(isDenari).length) >= 6,
  };
  // When this hand decides the match (it ends here in nearly every possible deal, whichever of the two moves
  // is played), what counts is winning it, not the margin: a move that is not behind any rival in how often
  // the match is won is charged at most as 'good'. In any other hand the match usually goes on and every
  // point lost still counts, so the guard does not apply.
  let matchSafe = false;
  const mv = sampler.matchValues;
  const decides = (c: number) => (mv && mv[c]!.length > 0 ? mv[c]!.reduce((n, v) => n + (v !== 0 ? 1 : 0), 0) / mv[c]!.length : 0);
  if (mv && credited > GOOD_LIMIT && Math.min(decides(playedIdx), decides(best)) >= MATCH_DECIDED) {
    const behind = contenders.some((c) => {
      if (c === playedIdx) return false;
      const g = paired(mv[c]!, mv[playedIdx]!);
      return exhaustive ? g.d > 0.005 : g.d > 0.02 && g.d > 2 * g.se;
    });
    if (!behind) {
      credited = GOOD_LIMIT;
      matchSafe = true;
    }
  }
  // No harsh verdict on the simulation's word alone: the loss charged is limited to what the concrete,
  // showable reasons can account for.
  const candidates = credited > 0 ? candidatesFor(options[playedPos]!, options[0]!, decided) : [];
  const limited = limitedLoss(credited, explainedLimit(candidates));
  // Worth telling the player only when it changes the mark (a blunder limited to a slightly smaller blunder is not).
  const capped = accuracyOf(limited) - accuracyOf(credited) >= 5;
  credited = limited;
  let reasons = credited > 0 ? reasonsFrom(candidates, options[playedPos]!, options[0]!, credited) : [];
  let cls = classOf(credited);

  if (cls === 'best') {
    // Brilliant: the best move, where the obvious one (what a decent player sees at a glance) was a real error.
    const obvious = bestByHeuristic(view, seat, rules, naiveKnowledge(view, seat), false);
    const obviousIdx = moves.findIndex((m) => sameMove(m, { card: obvious.card, captured: obvious.capture }));
    if (obviousIdx >= 0 && obviousIdx !== playedIdx && contenders.includes(obviousIdx)) {
      const g = paired(values[playedIdx]!, values[obviousIdx]!);
      const h = paired(sampler.playoutValues[playedIdx]!, sampler.playoutValues[obviousIdx]!);
      // by both judges, and beyond doubt
      if (Math.min(g.d - 2 * g.se, h.d - 2 * h.se) >= BRILLIANT_MARGIN) cls = 'brilliant';
    } else if (obviousIdx >= 0 && obviousIdx !== playedIdx) {
      // The obvious move was dropped after the first batch for being far behind: compared on those deals, by both judges.
      const g = paired(values[playedIdx]!, values[obviousIdx]!);
      const h = paired(sampler.playoutValues[playedIdx]!, sampler.playoutValues[obviousIdx]!);
      if (Math.min(g.d - 2 * g.se, h.d - 2 * h.se) >= BRILLIANT_MARGIN) cls = 'brilliant';
    }
    reasons = stake >= 0.4 || cls === 'brilliant' ? praiseFor(options[playedPos]!, options) : [];
  }

  return {
    ...base,
    options,
    played: playedPos,
    loss: round3(loss),
    se: round3(se),
    credited: round3(credited),
    stake: round3(stake),
    // A decision never weighs less than what it cost.
    weight: round3(weightOf(Math.max(stake, credited))),
    accuracy: Math.round(accuracyOf(credited) * 10) / 10,
    cls,
    reasons,
    ...(matchSafe ? { matchSafe: true } : null),
    ...(capped ? { capped: true } : null),
  };
}

/**
 * Analyse one decision from the only data the analysis may see (see
 * `Decision`). This is what the worker runs. Null if the record is inconsistent.
 */
export function analyseDecision(d: Decision, rules: Rules, scores?: readonly [number, number], budget?: AnalysisBudget): AnalysedMove | null {
  const pos = positionOf(d, rules);
  return pos ? analysePosition(pos, rules, d.played, d.index, budget, scores) : null;
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * Analyse the move at `index` of `hand`'s history as its player saw it.
 * Null when that player's cards cannot be known from `hand`.
 */
export function analyseMove(
  hand: HandState,
  rules: Rules,
  index: number,
  budget?: AnalysisBudget,
  scores?: readonly [number, number],
): AnalysedMove | null {
  const played = hand.history[index];
  if (!played) return null;
  const pos = positionBefore(hand, rules, played.seat, index);
  return pos ? analysePosition(pos, rules, played, index, budget, scores) : null;
}

/** Put the analysed moves of one seat together. `total` = how many moves that seat has made in the hand. */
export function summarise(handNumber: number, seat: Seat, moves: MoveReview[], total: number, handDone: boolean): HandReview {
  const sorted = [...moves].sort((a, b) => a.index - b.index);
  const complete = handDone && sorted.length === total;
  return {
    handNumber,
    seat,
    moves: sorted,
    score: complete ? handScore(sorted) : null,
    counts: classCounts(sorted),
    total,
    complete,
  };
}

/** Analyse every move of `seat` in a hand (used by tests and the calibration script). */
export function analyseHand(
  hand: HandState,
  rules: Rules,
  seat: Seat,
  handNumber = 1,
  budget?: AnalysisBudget,
): HandReview | null {
  const indices = moveIndices(hand, seat);
  const moves: MoveReview[] = [];
  for (const index of indices) {
    const r = analyseMove(hand, rules, index, budget);
    if (!r) return null;
    moves.push(r);
  }
  return summarise(handNumber, seat, moves, indices.length, hand.done);
}
