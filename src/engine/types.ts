import type { CardId } from './cards';

/** Seats 0..3. Play runs counter-clockwise: seat s is followed by (s + 1) % 4. */
export type Seat = 0 | 1 | 2 | 3;
/** Team 0 = seats 0 & 2, team 1 = seats 1 & 3 (partners sit opposite). */
export type Team = 0 | 1;

export type Variant = 'scientifico' | 'classico';
export type TargetScore = 11 | 21 | 31;

export interface Rules {
  /** Scientifico: 10 cards each, empty table. Classico: 9 each, 4 on the table. */
  variant: Variant;
  target: TargetScore;
  /** When true (the default) a sweep made with the very last card of the hand does NOT score. */
  lastCardScopaExcluded: boolean;
  /** 1 point for the King of Coins. */
  reBello: boolean;
  /** A-2-3 of Coins = 3 points, +1 for each further card continuing the run. */
  napola: boolean;
}

export const DEFAULT_RULES: Rules = {
  variant: 'scientifico',
  target: 21,
  lastCardScopaExcluded: true,
  reBello: false,
  napola: false,
};

/** A move: play `card`, taking `capture` from the table (empty = lay the card down). */
export interface Move {
  card: CardId;
  capture: CardId[];
}

/** A move as recorded in the public history of a hand. */
export interface PlayedMove {
  seat: Seat;
  card: CardId;
  captured: CardId[];
  scopa: boolean;
  /** The table as it was just before the card was played. */
  tableBefore: CardId[];
}

export interface HandState {
  /** Cards held by each seat. In a player view other hands contain HIDDEN (-1). */
  hands: CardId[][];
  table: CardId[];
  /** Cards captured by each team. */
  captured: [CardId[], CardId[]];
  /** Sweeps scored by each team. */
  scope: [number, number];
  turn: Seat;
  dealer: Seat;
  lastCaptureTeam: Team | null;
  history: PlayedMove[];
  /** Cards dealt face up at the start (Classico only). */
  initialTable: CardId[];
  /** Cards still on the table at the end, and who received them. */
  leftover: { team: Team | null; cards: CardId[] } | null;
  done: boolean;
}

export interface TeamBreakdown {
  cards: number;
  denari: number;
  settebello: boolean;
  /** Sum of the best primiera card in each suit. */
  primiera: number;
  /** Best primiera card per suit (denari, coppe, spade, bastoni); null if the suit is missing. */
  primieraCards: (CardId | null)[];
  scope: number;
  reBello: boolean;
  /** Length of the Coins run starting at the Ace (0 if shorter than 3). */
  napola: number;
}

export const SCORE_CATEGORIES = [
  'carte',
  'denari',
  'settebello',
  'primiera',
  'scope',
  'reBello',
  'napola',
] as const;
export type ScoreCategory = (typeof SCORE_CATEGORIES)[number];

export interface HandScore {
  detail: [TeamBreakdown, TeamBreakdown];
  points: Record<ScoreCategory, [number, number]>;
  total: [number, number];
}

export type Phase = 'playing' | 'handEnd' | 'matchEnd';

export interface MatchState {
  rules: Rules;
  /** Seed the match was created with (0 in player views). */
  seed: number;
  /** Current RNG state, advanced by every deal (0 in player views). */
  rngState: number;
  /** 1-based. */
  handNumber: number;
  scores: [number, number];
  hand: HandState;
  phase: Phase;
  /** One entry per completed hand. */
  handScores: HandScore[];
  winner: Team | null;
}

export function teamOf(seat: number): Team {
  return (seat & 1) as Team;
}

export function nextSeat(seat: number): Seat {
  return ((seat + 1) & 3) as Seat;
}

export function partnerOf(seat: number): Seat {
  return ((seat + 2) & 3) as Seat;
}
