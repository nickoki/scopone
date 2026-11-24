import type { MatchState, Move, Seat } from '../engine';

export const AI_LEVELS = ['facile', 'medio', 'difficile'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

export interface AiOptions {
  level: AiLevel;
  /** Seed for the AI's own randomness (tie-breaks, sampling). */
  seed: number;
  /** Difficile: wall-clock budget for Monte Carlo sampling. */
  budgetMs?: number;
  /** Difficile: fixed number of sampled deals (overrides the time budget; deterministic). */
  samples?: number;
}

export interface AiRequest {
  id: number;
  view: MatchState;
  seat: Seat;
  options: AiOptions;
}

export interface AiResponse {
  id: number;
  move?: Move;
  error?: string;
}
