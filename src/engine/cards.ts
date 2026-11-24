/**
 * Card primitives for the 40-card Italian deck.
 *
 * A card is a small integer 0..39 so that states are cheap to copy,
 * serialise and hash:  id = suitIndex * 10 + (rank - 1).
 */

export const SUITS = ['denari', 'coppe', 'spade', 'bastoni'] as const;
export type Suit = (typeof SUITS)[number];

/** 0..39, or HIDDEN for a card the viewer is not allowed to see. */
export type CardId = number;

/** Placeholder used in player views for cards held by other players. */
export const HIDDEN = -1;

export const DECK_SIZE = 40;

/** Rank 1..10: Asso=1, 2..7, Fante=8, Cavallo=9, Re=10. */
export function rankOf(card: CardId): number {
  return (card % 10) + 1;
}

export function suitIndexOf(card: CardId): number {
  return (card / 10) | 0;
}

export function suitOf(card: CardId): Suit {
  return SUITS[suitIndexOf(card)]!;
}

export function cardId(suit: Suit, rank: number): CardId {
  return SUITS.indexOf(suit) * 10 + (rank - 1);
}

export function isDenari(card: CardId): boolean {
  return card < 10;
}

/** The 7 of Coins. */
export const SETTEBELLO: CardId = 6;
/** The King of Coins. */
export const RE_BELLO: CardId = 9;

/** Primiera value by rank (index 0 unused). */
export const PRIMIERA_VALUE: readonly number[] = [0, 16, 12, 13, 14, 15, 18, 21, 10, 10, 10];

export function fullDeck(): CardId[] {
  const d: CardId[] = [];
  for (let i = 0; i < DECK_SIZE; i++) d.push(i);
  return d;
}

/** Short debug label, e.g. "7D" (7 of Denari), "10B" (Re di Bastoni). */
export function cardLabel(card: CardId): string {
  if (card === HIDDEN) return '??';
  return `${rankOf(card)}${'DCSB'[suitIndexOf(card)]}`;
}
