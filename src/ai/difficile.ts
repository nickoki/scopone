/**
 * Difficile: card tracking + inference + Monte Carlo over the hidden hands.
 *
 *  1. Everything public is tracked: the cards still unseen are exactly those
 *     in the other three hands.
 *  2. Inference: a player who declined a sweep that was "on" is assumed not to
 *     hold the sweeping rank.
 *  3. Many possible deals of the unseen cards are sampled. For each deal every
 *     candidate move is evaluated by playing the hand out (all four seats
 *     using the heuristic policy, so the partner's likely cards are played
 *     cooperatively) or, in the last three rounds, by exact alpha-beta search.
 *  4. The move with the best average point difference wins; the heuristic
 *     (with exact "can the next opponent sweep?" probabilities) is the prior.
 */
import {
  DECK_SIZE,
  HIDDEN,
  applyMoveMut,
  legalMoves,
  nextSeat,
  rankOf,
  scoreHand,
  sweepRank,
  teamOf,
  type CardId,
  type HandState,
  type Move,
  type Rng,
  type Rules,
} from '../engine';
import { bestByHeuristic, evalMove, type Knowledge } from './heuristics';

export interface Tracking {
  /** Cards not visible to the seat: they are in the other three hands. */
  unseen: CardId[];
  /** Per seat: bitmask of ranks the seat is believed not to hold. */
  voids: number[];
}

/** Rebuild what the seat knows from its hand, the table, the piles and the public history. */
export function track(hand: HandState, seat: number): Tracking {
  const seen = new Uint8Array(DECK_SIZE);
  for (const c of hand.hands[seat]!) if (c !== HIDDEN) seen[c] = 1;
  for (const c of hand.table) seen[c] = 1;
  for (const c of hand.captured[0]) seen[c] = 1;
  for (const c of hand.captured[1]) seen[c] = 1;
  const unseen: CardId[] = [];
  for (let c = 0; c < DECK_SIZE; c++) if (!seen[c]) unseen.push(c);

  const voids = [0, 0, 0, 0];
  for (const mv of hand.history) {
    const s = sweepRank(mv.tableBefore);
    if (s > 0 && mv.captured.length !== mv.tableBefore.length) voids[mv.seat]! |= 1 << s;
  }
  return { unseen, voids };
}

export function exactKnowledge(hand: HandState, seat: number, t: Tracking): Knowledge {
  const others = new Int8Array(11);
  for (const c of t.unseen) others[rankOf(c)]!++;
  const next = nextSeat(seat);
  return {
    others,
    unknown: t.unseen.length,
    nextCount: hand.hands[next]!.length,
    nextVoid: t.voids[next]!,
  };
}

/** Deal the unseen cards to the other seats, honouring the inferred voids where possible. */
export function determinize(hand: HandState, seat: number, t: Tracking, rng: Rng): HandState {
  const need = [0, 0, 0, 0];
  const hands: CardId[][] = [[], [], [], []];
  for (let s = 0; s < 4; s++) {
    if (s === seat) hands[s] = hand.hands[s]!.slice();
    else need[s] = hand.hands[s]!.length;
  }
  // Shuffle, then place the most constrained cards first.
  const cards = t.unseen.slice();
  for (let i = cards.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const tmp = cards[i]!;
    cards[i] = cards[j]!;
    cards[j] = tmp;
  }
  const anyVoid = t.voids[0]! | t.voids[1]! | t.voids[2]! | t.voids[3]!;
  if (anyVoid) {
    const constraint = (c: CardId) => {
      const bit = 1 << rankOf(c);
      let n = 0;
      for (let s = 0; s < 4; s++) if (s !== seat && t.voids[s]! & bit) n++;
      return n;
    };
    cards.sort((a, b) => constraint(b) - constraint(a));
  }
  for (const c of cards) {
    const bit = 1 << rankOf(c);
    let total = 0;
    for (let s = 0; s < 4; s++) if (need[s]! > 0 && !(t.voids[s]! & bit)) total += need[s]!;
    const strict = total > 0;
    if (!strict) for (let s = 0; s < 4; s++) total += need[s]!;
    if (total === 0) break;
    let pick = rng.int(total);
    for (let s = 0; s < 4; s++) {
      if (need[s]! <= 0 || (strict && t.voids[s]! & bit)) continue;
      pick -= need[s]!;
      if (pick < 0) {
        hands[s]!.push(c);
        need[s]!--;
        break;
      }
    }
  }
  return {
    hands,
    table: hand.table.slice(),
    captured: [hand.captured[0].slice(), hand.captured[1].slice()],
    scope: [hand.scope[0], hand.scope[1]],
    turn: hand.turn,
    dealer: hand.dealer,
    lastCaptureTeam: hand.lastCaptureTeam,
    history: [],
    initialTable: hand.initialTable,
    leftover: null,
    done: false,
  };
}

function cloneLite(h: HandState): HandState {
  return {
    hands: [h.hands[0]!.slice(), h.hands[1]!.slice(), h.hands[2]!.slice(), h.hands[3]!.slice()],
    table: h.table.slice(),
    captured: [h.captured[0].slice(), h.captured[1].slice()],
    scope: [h.scope[0], h.scope[1]],
    turn: h.turn,
    dealer: h.dealer,
    lastCaptureTeam: h.lastCaptureTeam,
    history: h.history,
    initialTable: h.initialTable,
    leftover: null,
    done: false,
  };
}

/** Points of team 0 minus points of team 1 for a finished hand. */
function finalDiff(h: HandState, rules: Rules): number {
  const s = scoreHand(h.captured, h.scope, rules);
  return s.total[0] - s.total[1];
}

/** Play the hand out with the heuristic policy for every seat. Mutates `h`. */
function playout(h: HandState, rules: Rules): number {
  const inHands = new Int8Array(11);
  let total = 0;
  for (let s = 0; s < 4; s++) {
    const cards = h.hands[s]!;
    total += cards.length;
    for (let i = 0; i < cards.length; i++) inHands[rankOf(cards[i]!)]!++;
  }
  const others = new Int8Array(11);
  const kn: Knowledge = { others, unknown: 0, nextCount: 0, nextVoid: 0 };
  while (!h.done) {
    const seat = h.turn;
    const mine = h.hands[seat]!;
    for (let r = 1; r <= 10; r++) others[r] = inHands[r]!;
    for (let i = 0; i < mine.length; i++) others[rankOf(mine[i]!)]!--;
    kn.unknown = total - mine.length;
    kn.nextCount = h.hands[(seat + 1) & 3]!.length;
    const move = mine.length === 1 ? onlyMove(h, seat, rules, kn) : bestByHeuristic(h, seat, rules, kn, true);
    inHands[rankOf(move.card)]!--;
    total--;
    applyMoveMut(h, move, rules, false);
  }
  return finalDiff(h, rules);
}

function onlyMove(h: HandState, seat: number, rules: Rules, kn: Knowledge): Move {
  return bestByHeuristic(h, seat, rules, kn, false);
}

/** Exact minimax (team 0 maximises) with alpha-beta; used when few cards remain. */
function search(h: HandState, rules: Rules, alpha: number, beta: number): number {
  if (h.done) return finalDiff(h, rules);
  const moves = legalMoves(h);
  // Captures first: better pruning.
  if (moves.length > 1) moves.sort((a, b) => b.capture.length - a.capture.length);
  const maxing = teamOf(h.turn) === 0;
  let best = maxing ? -Infinity : Infinity;
  for (let i = 0; i < moves.length; i++) {
    const child = cloneLite(h);
    applyMoveMut(child, moves[i]!, rules, false);
    const v = search(child, rules, alpha, beta);
    if (maxing) {
      if (v > best) best = v;
      if (best > alpha) alpha = best;
    } else {
      if (v < best) best = v;
      if (best < beta) beta = best;
    }
    if (alpha >= beta) break;
  }
  return best;
}

export interface DifficileOptions {
  samples?: number;
  budgetMs?: number;
  now?: () => number;
}

const MAX_CANDIDATES = 6;
const SEARCH_MAX_CARDS = 3;
const PRIOR_WEIGHT = 0.12;

export function chooseDifficile(
  hand: HandState,
  seat: number,
  rules: Rules,
  rng: Rng,
  opts: DifficileOptions = {},
): Move {
  const moves = legalMoves(hand, seat);
  if (moves.length === 1) return moves[0]!;

  const t = track(hand, seat);
  const kn = exactKnowledge(hand, seat, t);
  const scored = moves
    .map((move) => ({ move, prior: evalMove(hand, move, rules, kn, true) + rng.next() * 0.01, sum: 0 }))
    .sort((a, b) => b.prior - a.prior);
  const candidates = scored.slice(0, MAX_CANDIDATES);

  const exact = hand.hands[seat]!.length <= SEARCH_MAX_CARDS;
  const sign = teamOf(seat) === 0 ? 1 : -1;
  const now = opts.now ?? (() => performance.now());
  const fixed = opts.samples !== undefined;
  const maxSamples = opts.samples ?? 400;
  const minSamples = Math.min(maxSamples, 6);
  const deadline = fixed ? Infinity : now() + (opts.budgetMs ?? 450);

  let n = 0;
  while (n < maxSamples) {
    const deal = determinize(hand, seat, t, rng);
    for (let i = 0; i < candidates.length; i++) {
      const h = cloneLite(deal);
      applyMoveMut(h, candidates[i]!.move, rules, false);
      const v = h.done ? finalDiff(h, rules) : exact ? search(h, rules, -Infinity, Infinity) : playout(h, rules);
      candidates[i]!.sum += sign * v;
    }
    n++;
    if (!fixed && n >= minSamples && now() >= deadline) break;
  }

  let best = candidates[0]!;
  let bestV = -Infinity;
  for (const cand of candidates) {
    const v = cand.sum / n + PRIOR_WEIGHT * cand.prior;
    if (v > bestV) {
      bestV = v;
      best = cand;
    }
  }
  return best.move;
}
