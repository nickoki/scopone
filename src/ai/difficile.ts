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
  SCORE_CATEGORIES,
  SETTEBELLO,
  applyMoveMut,
  legalMoves,
  matchWinner,
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
  type ScoreCategory,
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

/** Play the hand out with the heuristic policy for every seat and return the final point difference. Mutates `h`. */
function playout(h: HandState, rules: Rules): number {
  playToEnd(h, rules);
  return finalDiff(h, rules);
}

/** Play the hand out (or at most `maxPlies` cards of it) with the heuristic policy for every seat. Mutates `h`. */
function playToEnd(h: HandState, rules: Rules, maxPlies = Infinity): void {
  const inHands = new Int8Array(11);
  let total = 0;
  for (let s = 0; s < 4; s++) {
    const cards = h.hands[s]!;
    total += cards.length;
    for (let i = 0; i < cards.length; i++) inHands[rankOf(cards[i]!)]!++;
  }
  const others = new Int8Array(11);
  const kn: Knowledge = { others, unknown: 0, nextCount: 0, nextVoid: 0 };
  for (let ply = 0; !h.done && ply < maxPlies; ply++) {
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

/**
 * Samples outcomes for the legal moves of one position, a batch at a time.
 * Every move sampled in a batch sees the same deals of the unseen cards
 * (common random numbers), so moves are compared on equal terms. That removes
 * some of the noise from their difference, not most of it: a different card
 * sends the rest of the hand down another path (measured: the outcomes of two
 * moves on the same deal correlate at only about 0.3). `hand` must be the
 * seat's own view: the other hands are sampled from what the seat can know,
 * never read.
 */
/** What happened, per move, in the three plays that follow it (i.e. before the mover's next turn). */
export interface NearFuture {
  /** Deals in which the opponents made a scopa in that stretch. */
  oppScopa: number;
  /** Deals in which the mover's partner made one. */
  ownScopa: number;
  /** Deals in which the opponents / the mover's side won the settebello in that stretch. */
  oppSettebello: number;
  ownSettebello: number;
  /** Deals in which the opponents captured the card this move laid on the table, in that stretch. */
  oppLaid: number;
}

export interface MoveSampler {
  readonly moves: Move[];
  /**
   * True in the last three rounds, where each deal is solved by exact search
   * with all four hands open. That is a harsher judge than any player can be,
   * so the heuristic playout of the same deals is kept alongside it.
   */
  readonly exact: boolean;
  /** Outcomes per move (mover's team minus the other, in points); entry k of two moves sampled together is the same deal. */
  readonly values: number[][];
  /** The same deals played out by the heuristic policy. The very same array as `values` unless `exact`. */
  readonly playoutValues: number[][];
  /** Per move, the playout outcomes split by scoring category, summed over that move's deals. */
  readonly categorySums: Record<ScoreCategory, number>[];
  /** Per move, counts over that move's deals of what the playout saw before the mover's next turn. */
  readonly near: NearFuture[];
  /**
   * Per move, how each deal ends the MATCH when the running scores are given: +1 the mover's side wins it with this
   * hand, -1 the other side does, 0 it goes on. Null when no scores were given.
   */
  readonly matchValues: number[][] | null;
  /** Deals drawn so far, and in how many of them the next player held at least one card of each rank (index 1..10). */
  readonly deals: { count: number; nextHolds: number[] };
  /** Draw `count` more deals and play each of the given moves (indices into `moves`) on all of them. */
  sample(indices: readonly number[], count: number): void;
  /**
   * When the unseen cards can be dealt in at most `maxDeals` different ways,
   * play every move on every one of them (each exactly once) and return true:
   * the averages are then exact, with no sampling noise. Otherwise do nothing.
   */
  exhaust(maxDeals: number): boolean;
}

/** n! / (a! b! c!) for small numbers: in how many ways the unseen cards can be dealt. */
function dealCount(need: readonly number[]): number {
  let total = 0;
  for (const n of need) total += n;
  let ways = 1;
  let left = total;
  for (const n of need) {
    // choose n of the remaining `left`
    let c = 1;
    for (let i = 1; i <= n; i++) c = (c * (left - n + i)) / i;
    ways *= c;
    left -= n;
  }
  return Math.round(ways);
}

/** Every way of dealing `cards` to the seats in `need` (cards per seat), honouring the voids when `strict`. */
function forEachDeal(
  cards: readonly CardId[],
  need: readonly number[],
  voids: readonly number[],
  strict: boolean,
  visit: (hands: CardId[][]) => void,
): void {
  const seats = [0, 1, 2, 3].filter((s) => need[s]! > 0);
  const hands: CardId[][] = [[], [], [], []];
  const used = new Uint8Array(cards.length);
  const fill = (si: number, from: number): void => {
    if (si === seats.length) {
      visit(hands);
      return;
    }
    const seat = seats[si]!;
    if (hands[seat]!.length === need[seat]) {
      fill(si + 1, 0);
      return;
    }
    for (let i = from; i < cards.length; i++) {
      if (used[i]) continue;
      if (strict && voids[seat]! & (1 << rankOf(cards[i]!))) continue;
      used[i] = 1;
      hands[seat]!.push(cards[i]!);
      fill(si, i + 1);
      hands[seat]!.pop();
      used[i] = 0;
    }
  };
  fill(0, 0);
}

export function createMoveSampler(
  hand: HandState,
  seat: number,
  rules: Rules,
  rng: Rng,
  /** The match score before this hand (public), to see which deals decide the match. */
  scores?: readonly [number, number],
): MoveSampler {
  const moves = legalMoves(hand, seat);
  const t = track(hand, seat);
  const exact = hand.hands[seat]!.length <= SEARCH_MAX_CARDS;
  const own = teamOf(seat);
  const opp = 1 - own;
  const sign = own === 0 ? 1 : -1;
  const next = nextSeat(seat);
  const values: number[][] = moves.map(() => []);
  const playoutValues: number[][] = exact ? moves.map(() => []) : values;
  const zero = (): Record<ScoreCategory, number> => ({ carte: 0, denari: 0, settebello: 0, primiera: 0, scope: 0, reBello: 0, napola: 0 });
  const categorySums = moves.map(zero);
  const near: NearFuture[] = moves.map(() => ({ oppScopa: 0, ownScopa: 0, oppSettebello: 0, ownSettebello: 0, oppLaid: 0 }));
  const deals = { count: 0, nextHolds: new Array<number>(11).fill(0) };
  const matchValues: number[][] | null = scores ? moves.map(() => []) : null;

  const playOn = (deal: HandState, indices: readonly number[]): void => {
    // Which ranks the next player holds in this deal.
    deals.count++;
    let mask = 0;
    for (const c of deal.hands[next]!) mask |= 1 << rankOf(c);
    for (let r = 1; r <= 10; r++) if (mask & (1 << r)) deals.nextHolds[r]!++;

    for (const i of indices) {
      const h = cloneLite(deal);
      applyMoveMut(h, moves[i]!, rules, false);
      if (exact && !h.done) values[i]!.push(sign * search(h, rules, -Infinity, Infinity)); // does not mutate h
      if (!h.done) {
        // The three plays before the mover's next turn, then the rest of the hand.
        const scopeOwn = h.scope[own]!;
        const scopeOpp = h.scope[opp]!;
        const hadOwn = h.captured[own]!.includes(SETTEBELLO);
        const hadOpp = h.captured[opp]!.includes(SETTEBELLO);
        playToEnd(h, rules, 3);
        const n = near[i]!;
        if (h.scope[opp]! > scopeOpp) n.oppScopa++;
        if (h.scope[own]! > scopeOwn) n.ownScopa++;
        if (!hadOpp && h.captured[opp]!.includes(SETTEBELLO)) n.oppSettebello++;
        if (!hadOwn && h.captured[own]!.includes(SETTEBELLO)) n.ownSettebello++;
        if (moves[i]!.capture.length === 0 && h.captured[opp]!.includes(moves[i]!.card)) n.oppLaid++;
        playToEnd(h, rules);
      }
      const score = scoreHand(h.captured, h.scope, rules);
      const v = sign * (score.total[0] - score.total[1]);
      playoutValues[i]!.push(v);
      if (exact && values[i]!.length < playoutValues[i]!.length) values[i]!.push(v); // the move ended the hand: nothing to search
      const sums = categorySums[i]!;
      for (const cat of SCORE_CATEGORIES) sums[cat] += sign * (score.points[cat][0] - score.points[cat][1]);
      if (matchValues && scores) {
        const winner = matchWinner([scores[0] + score.total[0], scores[1] + score.total[1]], rules.target);
        matchValues[i]!.push(winner === null ? 0 : winner === own ? 1 : -1);
      }
    }
  };
  return {
    moves,
    exact,
    values,
    playoutValues,
    categorySums,
    near,
    matchValues,
    deals,
    sample(indices, count) {
      for (let n = 0; n < count; n++) playOn(determinize(hand, seat, t, rng), indices);
    },
    exhaust(maxDeals) {
      const need = hand.hands.map((h, s) => (s === seat ? 0 : h.length));
      if (dealCount(need) > maxDeals) return false;
      const all = moves.map((_, i) => i);
      const base = determinize(hand, seat, t, rng); // only for its public fields and the mover's own hand
      const run = (strict: boolean): number => {
        let count = 0;
        forEachDeal(t.unseen, need, t.voids, strict, (hands) => {
          count++;
          const deal = cloneLite(base);
          for (let s = 0; s < 4; s++) if (s !== seat) deal.hands[s] = hands[s]!.slice();
          playOn(deal, all);
        });
        return count;
      };
      // Prefer the deals that agree with what the play so far implies; if there is none, use them all.
      if (run(true) === 0) run(false);
      return true;
    },
  };
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
