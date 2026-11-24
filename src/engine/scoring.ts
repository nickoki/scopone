import {
  PRIMIERA_VALUE,
  RE_BELLO,
  SETTEBELLO,
  isDenari,
  rankOf,
  suitIndexOf,
  type CardId,
} from './cards';
import type { HandScore, Rules, ScoreCategory, Team, TeamBreakdown } from './types';

/** Best primiera card per suit and their sum. A missing suit contributes 0. */
export function primiera(cards: readonly CardId[]): { total: number; best: (CardId | null)[] } {
  const best: (CardId | null)[] = [null, null, null, null];
  const bestVal = [0, 0, 0, 0];
  for (const c of cards) {
    const s = suitIndexOf(c);
    const v = PRIMIERA_VALUE[rankOf(c)]!;
    if (v > bestVal[s]!) {
      bestVal[s] = v;
      best[s] = c;
    }
  }
  return { total: bestVal[0]! + bestVal[1]! + bestVal[2]! + bestVal[3]!, best };
}

/**
 * Length of the run of Coins starting from the Ace (A, 2, 3, ...).
 * Returns 0 when the run is shorter than three cards (no Napola).
 */
export function napolaRun(cards: readonly CardId[]): number {
  let run = 0;
  // Coins are ids 0..9 in rank order.
  while (run < 10 && cards.includes(run)) run++;
  return run >= 3 ? run : 0;
}

export function teamBreakdown(cards: readonly CardId[], scope: number): TeamBreakdown {
  const p = primiera(cards);
  let denari = 0;
  for (const c of cards) if (isDenari(c)) denari++;
  return {
    cards: cards.length,
    denari,
    settebello: cards.includes(SETTEBELLO),
    primiera: p.total,
    primieraCards: p.best,
    scope,
    reBello: cards.includes(RE_BELLO),
    napola: napolaRun(cards),
  };
}

function higher(a: number, b: number): [number, number] {
  return a > b ? [1, 0] : b > a ? [0, 1] : [0, 0];
}

/** Score a finished hand. No point is awarded for a tied category. */
export function scoreHand(
  captured: readonly [readonly CardId[], readonly CardId[]],
  scope: readonly [number, number],
  rules: Rules,
): HandScore {
  const a = teamBreakdown(captured[0], scope[0]);
  const b = teamBreakdown(captured[1], scope[1]);
  const points: Record<ScoreCategory, [number, number]> = {
    carte: higher(a.cards, b.cards),
    denari: higher(a.denari, b.denari),
    settebello: [a.settebello ? 1 : 0, b.settebello ? 1 : 0],
    primiera: higher(a.primiera, b.primiera),
    scope: [a.scope, b.scope],
    reBello: rules.reBello ? [a.reBello ? 1 : 0, b.reBello ? 1 : 0] : [0, 0],
    napola: rules.napola ? [a.napola, b.napola] : [0, 0],
  };
  const total: [number, number] = [0, 0];
  for (const key of Object.keys(points) as ScoreCategory[]) {
    total[0] += points[key][0];
    total[1] += points[key][1];
  }
  return { detail: [a, b], points, total };
}

/**
 * Winner of the match given the running totals, or null to keep playing.
 * A team wins once at least one team has reached the target and the totals
 * differ: the higher total wins. An exact tie means another hand is played.
 */
export function matchWinner(scores: readonly [number, number], target: number): Team | null {
  if (scores[0] < target && scores[1] < target) return null;
  if (scores[0] === scores[1]) return null;
  return scores[0] > scores[1] ? 0 : 1;
}
