/// <reference lib="webworker" />
/**
 * A second Web Worker, separate from the one that plays the computer's moves,
 * so analysing the player's decisions never delays the game. It receives a
 * `Decision`: a record that has no field for anybody else's cards.
 */
import type { Rules } from '../engine';
import { analyseDecision } from './analyze';
import type { Decision } from './positions';
import type { MoveReview } from './types';

export interface AnalysisRequest {
  id: number;
  decision: Decision;
  rules: Rules;
  /** The match score before the hand (public). */
  scores: [number, number];
}

export interface AnalysisResponse {
  id: number;
  review?: MoveReview;
  error?: string;
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (ev: MessageEvent<AnalysisRequest>) => {
  const { id, decision, rules, scores } = ev.data;
  let res: AnalysisResponse;
  try {
    const review = analyseDecision(decision, rules, scores);
    res = review ? { id, review } : { id, error: 'inconsistent record' };
  } catch (err) {
    res = { id, error: err instanceof Error ? err.message : String(err) };
  }
  ctx.postMessage(res);
};
