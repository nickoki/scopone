/**
 * Rebuilds a decision exactly as the player saw it.
 *
 * A `Decision` holds everything the analysis is allowed to know, and nothing
 * else — by construction: it has the player's own cards, how many cards each
 * seat was dealt, the cards dealt face up, and the public record of the hand
 * up to that moment. There is no field in which another player's cards, a
 * later move or the deck could travel. The position the analysis works on is
 * rebuilt from a Decision alone, with every other hand filled with HIDDEN
 * placeholders.
 */
import {
  HIDDEN,
  applyMoveMut,
  nextSeat,
  type CardId,
  type HandState,
  type PlayedMove,
  type Rules,
  type Seat,
} from '../engine';

export interface Decision {
  seat: Seat;
  /** The cards this player was dealt (sorted). */
  dealtHand: CardId[];
  /** How many cards each seat was dealt (public). */
  dealtCounts: number[];
  dealer: Seat;
  /** Cards dealt face up at the start (Classico). */
  initialTable: CardId[];
  /** The public record of the hand before this move. */
  prefix: PlayedMove[];
  /** The move the player made. */
  played: PlayedMove;
  /** Position of that move in the hand's history. */
  index: number;
}

/** The cards `seat` was dealt: what it still holds plus what it has played. Null if they cannot be known. */
export function originalHand(hand: HandState, seat: number): CardId[] | null {
  const held = hand.hands[seat]!;
  if (held.some((c) => c === HIDDEN)) return null;
  const played = hand.history.filter((m) => m.seat === seat).map((m) => m.card);
  // Sorted, so a position is identical whenever it is rebuilt (mid-hand or after the hand).
  return [...held, ...played].sort((a, b) => a - b);
}

/** How many cards each seat was dealt. */
function dealtCounts(hand: HandState): number[] {
  const counts = hand.hands.map((h) => h.length);
  for (const m of hand.history) counts[m.seat]!++;
  return counts;
}

const copyMove = (m: PlayedMove): PlayedMove => ({
  seat: m.seat,
  card: m.card,
  captured: m.captured.slice(),
  scopa: m.scopa,
  tableBefore: m.tableBefore.slice(),
});

/**
 * Extract the decision at `index` of the history. Reads only the mover's own
 * cards and public data from `hand`; whatever else `hand` contains (the real
 * cards of the others when called on the host, moves made afterwards) is left
 * behind. Null when that player's cards are not visible in `hand`, or when
 * `index` is not one of that seat's moves.
 */
export function decisionAt(hand: HandState, seat: number, index: number): Decision | null {
  const played = hand.history[index];
  if (!played || played.seat !== seat) return null;
  const own = originalHand(hand, seat);
  if (!own) return null;
  return {
    seat: seat as Seat,
    dealtHand: own,
    dealtCounts: dealtCounts(hand),
    dealer: hand.dealer,
    initialTable: hand.initialTable.slice(),
    prefix: hand.history.slice(0, index).map(copyMove),
    played: copyMove(played),
    index,
  };
}

/**
 * The hand as the player saw it just before the move: own cards face up,
 * everyone else's hidden, history up to the move. Null if the record is
 * inconsistent.
 */
export function positionOf(d: Decision, rules: Rules): HandState | null {
  const state: HandState = {
    hands: d.dealtCounts.map((n, s) => (s === d.seat ? d.dealtHand.slice() : Array<CardId>(n).fill(HIDDEN))),
    table: d.initialTable.slice(),
    captured: [[], []],
    scope: [0, 0],
    turn: nextSeat(d.dealer),
    dealer: d.dealer,
    lastCaptureTeam: null,
    history: [],
    initialTable: d.initialTable.slice(),
    leftover: null,
    done: false,
  };
  for (const m of d.prefix) {
    if (state.turn !== m.seat || state.done) return null;
    applyMoveMut(state, { card: m.card, capture: m.captured }, rules);
  }
  return state.turn === d.seat && !state.done ? state : null;
}

/** `decisionAt` + `positionOf`: the position before the move at `index`, as its player saw it. */
export function positionBefore(hand: HandState, rules: Rules, seat: number, index: number): HandState | null {
  const d = decisionAt(hand, seat, index);
  return d ? positionOf(d, rules) : null;
}

/** Indices (into the history) of the moves made by `seat`. */
export function moveIndices(hand: HandState, seat: number): number[] {
  const out: number[] = [];
  hand.history.forEach((m, i) => {
    if (m.seat === seat) out.push(i);
  });
  return out;
}
