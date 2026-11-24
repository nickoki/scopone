import type { CardId } from './cards';
import { DEFAULT_RULES, type HandState, type MatchState, type Rules, type Seat } from './types';

/** Parse "7D" / "10B" style labels (D=Denari, C=Coppe, S=Spade, B=Bastoni). */
export function c(label: string): CardId {
  const suit = 'DCSB'.indexOf(label.slice(-1));
  const rank = Number(label.slice(0, -1));
  if (suit < 0 || !(rank >= 1 && rank <= 10)) throw new Error(`bad card label ${label}`);
  return suit * 10 + rank - 1;
}

/** Parse a space separated list of labels. */
export function cs(labels: string): CardId[] {
  return labels.trim() === '' ? [] : labels.trim().split(/\s+/).map(c);
}

export function makeHand(partial: Partial<HandState> & { hands: CardId[][] }): HandState {
  return {
    table: [],
    captured: [[], []],
    scope: [0, 0],
    turn: 0,
    dealer: 3,
    lastCaptureTeam: null,
    history: [],
    initialTable: [],
    leftover: null,
    done: false,
    ...partial,
  };
}

export function makeMatch(hand: HandState, rules: Partial<Rules> = {}, scores: [number, number] = [0, 0]): MatchState {
  return {
    rules: { ...DEFAULT_RULES, ...rules },
    seed: 1,
    rngState: 1,
    handNumber: 1,
    scores,
    hand,
    phase: 'playing',
    handScores: [],
    winner: null,
  };
}

export const SEATS: readonly Seat[] = [0, 1, 2, 3];
