import type { MoveClass } from '../../analysis/types';

/** Symbol and colour of each move class (the symbols follow chess annotation). */
export const CLASS_STYLE: Record<MoveClass, { symbol: string; color: string; ink: string }> = {
  brilliant: { symbol: '!!', color: '#1f9d98', ink: '#fff' },
  best: { symbol: '★', color: '#4f8a34', ink: '#fff' },
  good: { symbol: '✓', color: '#8aa651', ink: '#fff' },
  inaccuracy: { symbol: '?!', color: '#e0a526', ink: '#3a2114' },
  mistake: { symbol: '?', color: '#d9742b', ink: '#fff' },
  blunder: { symbol: '??', color: '#c0392b', ink: '#fff' },
  forced: { symbol: '→', color: '#9a8b78', ink: '#fff' },
};

/** Classes worth counting in a summary, in display order. */
export const SUMMARY_CLASSES: readonly MoveClass[] = ['brilliant', 'best', 'good', 'inaccuracy', 'mistake', 'blunder'];

/** Colour of a score out of 10. */
export function scoreColor(score: number): string {
  if (score >= 8.5) return '#4f8a34';
  if (score >= 7) return '#8aa651';
  if (score >= 5.5) return '#e0a526';
  if (score >= 4) return '#d9742b';
  return '#c0392b';
}
