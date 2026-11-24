import type { AiLevel } from '../ai/types';
import { createMatch, randomSeed, type Rules } from '../engine';
import { KEYS, loadJson, removeKey, saveJson } from '../state/storage';
import type { LocalGame, LocalMode, SeatConfig } from './types';

/** Names for computer players, by seat. */
export const AI_NAMES = ['Lina', 'Gino', 'Rosa', 'Beppe'] as const;

export function defaultSeats(mode: LocalMode, playerName: string, you: string, playerN: (n: number) => string): SeatConfig[] {
  const ai = (seat: number, level: AiLevel = 'medio'): SeatConfig => ({ kind: 'ai', name: AI_NAMES[seat]!, level });
  if (mode === 'ai') {
    return [{ kind: 'human', name: playerName || you, level: 'medio' }, ai(1), ai(2), ai(3)];
  }
  return [
    { kind: 'human', name: playerName || playerN(1), level: 'medio' },
    { kind: 'human', name: playerN(2), level: 'medio' },
    ai(2),
    ai(3),
  ];
}

export function newLocalGame(mode: LocalMode, seats: SeatConfig[], rules: Rules, tutorial: boolean): LocalGame {
  return { mode, seats, match: createMatch(rules, randomSeed()), tutorial, savedAt: Date.now() };
}

/** Load the unfinished local game, if there is a usable one. */
export function loadLocalGame(): LocalGame | null {
  const g = loadJson<LocalGame>(KEYS.localGame);
  try {
    if (
      !g ||
      !Array.isArray(g.seats) ||
      g.seats.length !== 4 ||
      !g.match ||
      g.match.phase === 'matchEnd' ||
      !Array.isArray(g.match.hand?.hands) ||
      g.match.hand.hands.length !== 4 ||
      typeof g.match.rngState !== 'number'
    ) {
      return null;
    }
    return g;
  } catch {
    return null;
  }
}

export function saveLocalGame(game: LocalGame): void {
  if (game.match.phase === 'matchEnd') removeKey(KEYS.localGame);
  else saveJson(KEYS.localGame, game);
}

export function clearLocalGame(): void {
  removeKey(KEYS.localGame);
}
