/**
 * Shared move evaluation used by Medio directly, by Difficile as a prior
 * and as the playout policy inside its Monte Carlo search.
 *
 * Values are expressed in "points": 1.0 is roughly one point on the scoreboard.
 */
import {
  RE_BELLO,
  SETTEBELLO,
  capturesFor,
  isDenari,
  nextSeat,
  rankOf,
  type CardId,
  type HandState,
  type Move,
  type Rules,
} from '../engine';

/** What the mover believes about the cards it cannot see. */
export interface Knowledge {
  /** others[r] = copies of rank r that may be in the other three hands (index 1..10). */
  others: ArrayLike<number>;
  /** Number of cards held by the other three players. */
  unknown: number;
  /** Cards held by the next player. */
  nextCount: number;
  /** Bitmask of ranks the next player is believed not to hold. */
  nextVoid: number;
}

/** Probability that the next player holds at least one card of `rank`. */
export function pNextHas(kn: Knowledge, rank: number): number {
  const k = kn.others[rank]!;
  if (k <= 0 || kn.nextCount <= 0) return 0;
  if (kn.nextVoid & (1 << rank)) return 0.03;
  const n = kn.nextCount;
  const u = Math.max(kn.unknown, n, k);
  let miss = 1;
  for (let i = 0; i < k; i++) {
    const num = u - n - i;
    if (num <= 0) return 1;
    miss *= num / (u - i);
  }
  return 1 - miss;
}

/** Intrinsic worth of owning a card at the end of the hand. */
export function cardWorth(card: CardId, rules: Rules): number {
  const rank = rankOf(card);
  let v = 0.05; // carte
  if (rank === 7) v += 0.22; // primiera
  else if (rank === 6) v += 0.1;
  else if (rank === 1) v += 0.05;
  if (isDenari(card)) {
    v += 0.17;
    if (card === SETTEBELLO) v += 1;
    if (rules.reBello && card === RE_BELLO) v += 1;
    if (rules.napola) v += rank <= 3 ? 0.35 : rank <= 6 ? 0.1 : 0.03;
  }
  return v;
}

const SCOPA_VALUE = 1;
const SWEEP_RISK = 1.15;

/**
 * Score a move for the seat to play. `careful` adds the finer terms that the
 * stronger levels use (exposure of the laid card weighted by who can take it).
 */
export function evalMove(hand: HandState, move: Move, rules: Rules, kn: Knowledge, careful: boolean): number {
  const table = hand.table;
  const cardRank = rankOf(move.card);
  let v = 0;
  let sumAfter = 0;
  let countAfter = 0;
  for (let i = 0; i < table.length; i++) sumAfter += rankOf(table[i]!);
  countAfter = table.length;

  const handLeft = hand.hands[hand.turn]!.length - 1;
  const lastCardOfHand = kn.nextCount === 0 && handLeft === 0;

  if (move.capture.length > 0) {
    v += cardWorth(move.card, rules);
    for (let i = 0; i < move.capture.length; i++) {
      const c = move.capture[i]!;
      v += cardWorth(c, rules);
      sumAfter -= rankOf(c);
    }
    countAfter -= move.capture.length;
    if (countAfter === 0 && !(lastCardOfHand && rules.lastCardScopaExcluded)) v += SCOPA_VALUE;
    // Late captures also tend to collect whatever is left on the table.
    if (handLeft <= 1) v += 0.12;
  } else {
    const worth = cardWorth(move.card, rules);
    const exposure = careful ? 0.2 + 0.6 * pNextHas(kn, cardRank) : 0.5;
    v -= worth * exposure;
    sumAfter += cardRank;
    countAfter += 1;
    // Prefer shedding court cards and keeping low cards that combine well.
    v += cardRank >= 8 ? 0.03 : 0;
  }

  // Never leave an easy sweep for the opponent who plays next.
  if (countAfter > 0 && sumAfter <= 10 && kn.nextCount > 0) {
    const lastForNext = kn.nextCount === 1 && handLeft === 0 && isFinalTurnNext(hand);
    if (!(lastForNext && rules.lastCardScopaExcluded)) {
      v -= pNextHas(kn, sumAfter) * SWEEP_RISK;
    }
  }
  return v;
}

/** True when the next player's card will be the very last of the hand. */
function isFinalTurnNext(hand: HandState): boolean {
  let total = 0;
  for (let s = 0; s < 4; s++) total += hand.hands[s]!.length;
  return total === 2;
}

/** Knowledge available without remembering anything: own hand + table only. */
export function naiveKnowledge(hand: HandState, seat: number): Knowledge {
  const others = new Int8Array(11).fill(4);
  for (const c of hand.hands[seat]!) if (c >= 0) others[rankOf(c)]!--;
  for (const c of hand.table) others[rankOf(c)]!--;
  const next = nextSeat(seat);
  const nextCount = hand.hands[next]!.length;
  return { others, unknown: nextCount * 3, nextCount, nextVoid: 0 };
}

/** Pick the best move by `evalMove`; ties are broken with `tie()` in [0,1). */
export function bestByHeuristic(
  hand: HandState,
  seat: number,
  rules: Rules,
  kn: Knowledge,
  careful: boolean,
  tie?: () => number,
): Move {
  const cards = hand.hands[seat]!;
  let best: Move | null = null;
  let bestV = -Infinity;
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]!;
    const caps = capturesFor(card, hand.table);
    const n = caps.length === 0 ? 1 : caps.length;
    for (let k = 0; k < n; k++) {
      const move: Move = { card, capture: caps.length === 0 ? EMPTY : caps[k]! };
      let v = evalMove(hand, move, rules, kn, careful);
      if (tie) v += tie() * 0.02;
      if (v > bestV) {
        bestV = v;
        best = move;
      }
    }
  }
  return best!;
}

const EMPTY: CardId[] = [];
