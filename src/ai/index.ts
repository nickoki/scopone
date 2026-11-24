import {
  HIDDEN,
  cloneHand,
  legalMoves,
  makeRng,
  type HandState,
  type MatchState,
  type Move,
  type Rng,
  type Rules,
} from '../engine';
import { chooseDifficile } from './difficile';
import { bestByHeuristic, naiveKnowledge } from './heuristics';
import type { AiOptions } from './types';

export * from './types';

/** Facile: random among legal moves, but always takes an available scopa. */
export function chooseFacile(hand: HandState, seat: number, rng: Rng): Move {
  const moves = legalMoves(hand, seat);
  const sweeps = moves.filter((m) => m.capture.length > 0 && m.capture.length === hand.table.length);
  const pool = sweeps.length > 0 ? sweeps : moves;
  return pool[rng.int(pool.length)]!;
}

/** Medio: one-ply heuristics using only what is visible right now (no memory). */
export function chooseMedio(hand: HandState, seat: number, rules: Rules, rng: Rng): Move {
  return bestByHeuristic(hand, seat, rules, naiveKnowledge(hand, seat), false, () => rng.next());
}

/**
 * Choose a move for `seat`. The AI can never peek: whatever state it is given,
 * every other hand is masked before any decision logic runs.
 */
export function chooseMove(view: MatchState, seat: number, options: AiOptions): Move {
  const hand = cloneHand(view.hand);
  for (let s = 0; s < 4; s++) if (s !== seat) hand.hands[s] = hand.hands[s]!.map(() => HIDDEN);
  if (hand.turn !== seat) throw new Error('AI asked to move out of turn');
  const rng = makeRng(options.seed);
  switch (options.level) {
    case 'facile':
      return chooseFacile(hand, seat, rng);
    case 'medio':
      return chooseMedio(hand, seat, view.rules, rng);
    case 'difficile':
      return chooseDifficile(hand, seat, view.rules, rng, {
        samples: options.samples,
        budgetMs: options.budgetMs,
      });
  }
}
