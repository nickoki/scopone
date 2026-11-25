/**
 * From "expected points given up" to an accuracy figure and a label.
 * The numbers here are calibrated with `npm run accuracy` (see DECISIONS.md).
 */
import { MOVE_CLASSES, type MoveClass, type MoveReview } from './types';

/**
 * Accuracy of one decision, 0..100: 100 · exp(−(loss / SIGMA)²).
 *
 * The curve is flat near zero and steep in the middle, so the number agrees
 * with the label: a "good" move (up to 0.15 points) keeps at least 87%, an
 * inaccuracy (up to 0.4) at least 37%, a mistake (up to 0.8) at least 2%, and
 * a blunder — about a scopa handed over — is worth next to nothing.
 */
export const SIGMA = 0.4;

/**
 * The allowance for noise and model error: a measured gap up to this size is
 * not held against the player at all (more when the estimate is less precise).
 */
export const NOISE_FLOOR = 0.08;

/** Upper bounds (credited points given up) of each class, in order. */
export const CLASS_LIMITS: readonly [MoveClass, number][] = [
  ['best', 0],
  ['good', 0.15],
  ['inaccuracy', 0.4],
  ['mistake', 0.8],
  ['blunder', Infinity],
];

/**
 * A decision's weight in the hand score: what a careless choice would cost
 * there (and never less than what the move played did cost), within limits.
 */
export const WEIGHT_MIN = 0.2;
export const WEIGHT_MAX = 1.5;

/**
 * Without a concrete, checkable reason the analysis does not claim more than
 * an inaccuracy (this is the top of that band): the simulation alone is not
 * trusted for a harsh verdict.
 */
export const UNEXPLAINED_CAP = 0.4;

/** Below this, the gap between the best and the worst legal move is nothing: the decision is not scored. */
export const EVEN_SPREAD = 0.05;

/** The best move must beat the obvious one by this much, beyond doubt, to be called brilliant. */
export const BRILLIANT_MARGIN = 0.5;

/**
 * The loss held against the player: the measured gap minus one standard error
 * (and never less than NOISE_FLOOR is forgiven). A difference that could be
 * sampling noise gets the benefit of the doubt; the allowance is continuous,
 * so two almost identical measurements never get very different verdicts.
 */
export function creditedLoss(loss: number, se: number): number {
  return Math.max(0, loss - Math.max(NOISE_FLOOR, se));
}

export function accuracyOf(credited: number): number {
  const x = Math.max(0, credited) / SIGMA;
  return 100 * Math.exp(-x * x);
}

/** Top of the 'good' band: the most a move can be charged when it does not reduce the chance of winning the match. */
export const GOOD_LIMIT = 0.15;

export function classOf(credited: number): MoveClass {
  for (const [cls, limit] of CLASS_LIMITS) if (credited <= limit) return cls;
  return 'blunder';
}

export function weightOf(stake: number): number {
  return Math.max(WEIGHT_MIN, Math.min(WEIGHT_MAX, stake));
}

export function emptyCounts(): Record<MoveClass, number> {
  return Object.fromEntries(MOVE_CLASSES.map((c) => [c, 0])) as Record<MoveClass, number>;
}

/**
 * Score of a hand out of 10: the average accuracy of the real decisions,
 * each weighted by how much was at stake (forced moves do not count).
 */
export function handScore(moves: readonly MoveReview[]): number | null {
  let total = 0;
  let weight = 0;
  for (const m of moves) {
    if (m.cls === 'forced') continue;
    total += m.weight * m.accuracy;
    weight += m.weight;
  }
  return weight > 0 ? Math.round(total / weight) / 10 : null;
}

/** The same average over several hands (e.g. a whole match). */
export function overallScore(hands: readonly (readonly MoveReview[])[]): number | null {
  return handScore(hands.flat());
}

export function classCounts(moves: readonly MoveReview[]): Record<MoveClass, number> {
  const counts = emptyCounts();
  for (const m of moves) counts[m.cls]++;
  return counts;
}
