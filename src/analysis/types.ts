import type { CardId, Move, PlayedMove, ScoreCategory, Seat } from '../engine';

/**
 * How a decision compares with the best move the analysis found.
 *  - brilliant: the best move, where the obvious move would have cost real points
 *  - best:      the best move, or one the analysis cannot tell apart from it
 *  - good / inaccuracy / mistake / blunder: increasingly costly alternatives
 *  - forced:    only one legal move; not scored
 */
export type MoveClass = 'brilliant' | 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'forced';

export const MOVE_CLASSES: readonly MoveClass[] = ['brilliant', 'best', 'good', 'inaccuracy', 'mistake', 'blunder', 'forced'];

/** Plain facts about one possible move, all derivable from what the player could see. */
export interface OptionFacts {
  /** The move clears the table and the sweep counts. */
  scopa: boolean;
  /** Cards won by the move (captured cards + the card played); 0 when it is laid down. */
  cards: number;
  /** Coins among them. */
  denari: number;
  settebello: boolean;
  /** Sevens among them (the best primiera cards). */
  sevens: number;
  /** King of Coins, only when the Re bello rule is on. */
  reBello: boolean;
  /** Ace, 2 and 3 of Coins among the cards won, only when the Napola rule is on. */
  napola: number;
  /** Total and number of cards left on the table after the move. */
  leftSum: number;
  leftCount: number;
  /** Rank that would sweep what is left (0 = one card cannot sweep it, or the sweep would not count). */
  sweepRank: number;
  /** Cards of that rank the player has not seen: they are in the other three hands. */
  sweepOut: number;
  /**
   * Chance that the next player (always an opponent) holds one of them: the
   * share of the analysis's own sampled deals in which they do.
   */
  sweepChance: number;
  /** For a card laid on the table: it is a Coin / a seven / the settebello. */
  laidDenari: boolean;
  laidSeven: boolean;
  laidSettebello: boolean;
  /** For a card laid on the table: it is the Ace, 2 or 3 of Coins and the Napola rule is on. */
  laidNapola: boolean;
}

/** What the simulation saw, as shares of the deals, in the three plays before the mover's next turn. */
export interface NearShares {
  oppScopa: number;
  ownScopa: number;
  oppSettebello: number;
  ownSettebello: number;
  /** The opponents captured the card this move laid on the table. */
  oppLaid: number;
}

/**
 * Why one move is better than another; turned into a sentence by the UI.
 * Certain facts and exact odds come first; 'category' and 'longTerm' are the
 * honest fallbacks when only the simulation separates the two moves.
 */
export type Reason =
  | { code: 'missedScopa' }
  | { code: 'sweepGift'; sum: number; out: number; pct: number; bestPct: number }
  | { code: 'tableSafe'; sum: number }
  // what the simulation sees happen before the player's next turn
  | { code: 'nearScopa'; pct: number; bestPct: number }
  | { code: 'partnerScopa'; pct: number; playedPct: number }
  | { code: 'nearSettebello'; pct: number; bestPct: number }
  | { code: 'missedNapola'; n: number }
  | { code: 'missedSettebello' }
  | { code: 'laidSettebello'; pct: number; bestPct: number }
  | { code: 'missedReBello' }
  | { code: 'moreDenari'; n: number }
  | { code: 'missedSeven' }
  | { code: 'moreCards'; n: number }
  | { code: 'exposedCard'; pct: number; bestPct: number }
  | { code: 'category'; category: ScoreCategory; delta: number }
  | { code: 'longTerm' }
  // said about a good move
  | { code: 'tookScopa' }
  | { code: 'tookSettebello' }
  | { code: 'keptSafe'; sum: number }
  | { code: 'leastRisk'; pct: number; otherPct: number };

export interface MoveOption {
  move: Move;
  /** Expected points of the hand (own side minus the other) if this move is played. */
  ev: number;
  /**
   * How much worse than the best move, measured on the deals both were played
   * on (0 for the best move; never positive).
   */
  delta: number;
  /** True when that difference is within the noise: the analysis cannot tell this move from the best. */
  even: boolean;
  /** Deals this estimate is based on. */
  samples: number;
  /** The same expectation split by scoring category (from the playouts), when available. */
  byCategory: Record<ScoreCategory, number> | null;
  near: NearShares | null;
  facts: OptionFacts;
}

/** The analysis of one decision. */
export interface MoveReview {
  /** Position of the move in the hand's history. */
  index: number;
  seat: Seat;
  /** The player's cards and the table just before the move. */
  hand: CardId[];
  table: CardId[];
  /** What the other players did since this player's previous move. */
  since: PlayedMove[];
  /** Every legal move, best first. */
  options: MoveOption[];
  /** Index (into `options`) of the move that was played. */
  played: number;
  /** Expected points given up compared with the best move, as measured (never negative). */
  loss: number;
  /** Standard error of that difference: how far it could be off by chance. */
  se: number;
  /** The loss actually held against the player (after the benefit of the doubt). */
  credited: number;
  /** What was at stake: how much an average choice among the legal moves gives up here (points). */
  stake: number;
  /** Weight of this decision in the hand's score (0 for a forced move). */
  weight: number;
  /** 0..100 */
  accuracy: number;
  cls: MoveClass;
  reasons: Reason[];
  /** Online only: the computer played this move for the player while they were away. Not scored. */
  auto?: boolean;
  /** Every legal move was worth the same: nothing to get right or wrong. Not scored (class 'forced'). */
  even?: boolean;
  /**
   * The move gives up points on average but does not lower the chance of winning the match (which this hand
   * could decide), so it is not charged beyond 'good'.
   */
  matchSafe?: boolean;
}

export interface HandReview {
  handNumber: number;
  seat: Seat;
  moves: MoveReview[];
  /** 0..10 with one decimal, or null when the hand offered no real decision (or is not fully analysed yet). */
  score: number | null;
  counts: Record<MoveClass, number>;
  /** Moves of this seat in the hand so far, analysed or not. */
  total: number;
  /** False while some of the seat's moves are still being analysed. */
  complete: boolean;
}
