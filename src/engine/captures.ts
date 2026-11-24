import { HIDDEN, rankOf, type CardId } from './cards';
import type { HandState, Move } from './types';

/**
 * All legal captures for `card` on `table`.
 *
 * Rule: if at least one table card has the same rank, the card MUST take
 * exactly one card of that rank (the player picks which). Only when there is
 * no rank match may it take a set of two or more cards summing to its value.
 * An empty result means the card captures nothing and stays on the table.
 */
export function capturesFor(card: CardId, table: readonly CardId[]): CardId[][] {
  const rank = rankOf(card);
  const out: CardId[][] = [];
  for (let i = 0; i < table.length; i++) {
    if (rankOf(table[i]!) === rank) out.push([table[i]!]);
  }
  if (out.length > 0 || rank < 2) return out;

  // No rank match: enumerate subsets (size >= 2) that sum to `rank`.
  const n = table.length;
  const pick: CardId[] = [];
  const walk = (start: number, remaining: number): void => {
    for (let i = start; i < n; i++) {
      const c = table[i]!;
      const r = rankOf(c);
      if (r > remaining) continue;
      pick.push(c);
      if (r === remaining) {
        if (pick.length >= 2) out.push(pick.slice());
      } else {
        walk(i + 1, remaining - r);
      }
      pick.pop();
    }
  };
  walk(0, rank);
  return out;
}

/** Every legal move for the seat (default: the seat to play). */
export function legalMoves(hand: HandState, seat: number = hand.turn): Move[] {
  const moves: Move[] = [];
  const cards = hand.hands[seat]!;
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]!;
    if (card === HIDDEN) continue;
    const caps = capturesFor(card, hand.table);
    if (caps.length === 0) moves.push({ card, capture: [] });
    else for (let k = 0; k < caps.length; k++) moves.push({ card, capture: caps[k]! });
  }
  return moves;
}

function sameSet(a: readonly CardId[], b: readonly CardId[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!b.includes(a[i]!)) return false;
  return true;
}

/** Returns null when the move is legal, otherwise a short reason. */
export function moveError(hand: HandState, move: Move, seat: number = hand.turn): string | null {
  if (hand.done) return 'hand is over';
  if (seat !== hand.turn) return 'not this seat\'s turn';
  if (move.card === HIDDEN || !hand.hands[seat]!.includes(move.card)) return 'card not in hand';
  if (new Set(move.capture).size !== move.capture.length) return 'duplicate cards in capture';
  const caps = capturesFor(move.card, hand.table);
  if (caps.length === 0) return move.capture.length === 0 ? null : 'card cannot capture';
  if (move.capture.length === 0) return 'capture is mandatory';
  return caps.some((c) => sameSet(c, move.capture)) ? null : 'illegal capture';
}

/** True when a single card could sweep this table (a scopa is "on"). */
export function sweepRank(table: readonly CardId[]): number {
  if (table.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < table.length; i++) {
    sum += rankOf(table[i]!);
    if (sum > 10) return 0;
  }
  return sum;
}
