import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  HIDDEN,
  createMatch,
  legalMoves,
  makeRng,
  playMove,
  viewFor,
  type MatchState,
  type Rules,
} from '../engine';
import { moveIndices, originalHand, positionBefore } from './positions';

/** Play a whole hand with random legal moves, keeping every intermediate state. */
function playHand(rules: Rules, seed: number): MatchState[] {
  const rng = makeRng(seed * 7 + 1);
  const states = [createMatch(rules, seed)];
  while (!states.at(-1)!.hand.done) {
    const m = states.at(-1)!;
    const moves = legalMoves(m.hand);
    states.push(playMove(m, moves[rng.int(moves.length)]!));
  }
  return states;
}

describe.each<Rules['variant']>(['scientifico', 'classico'])('positions (%s)', (variant) => {
  const rules: Rules = { ...DEFAULT_RULES, variant };

  it('rebuilds every decision exactly as the player saw it', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const states = playHand(rules, seed);
      const final = states.at(-1)!;
      for (let seat = 0; seat < 4; seat++) {
        expect(originalHand(final.hand, seat)?.sort()).toEqual([...states[0]!.hand.hands[seat]!].sort());
        for (const index of moveIndices(final.hand, seat)) {
          const truth = viewFor(states[index]!, [seat]).hand; // what the seat really saw then
          const rebuilt = positionBefore(final.hand, rules, seat, index)!;
          expect([...rebuilt.hands[seat]!].sort()).toEqual([...truth.hands[seat]!].sort());
          for (let s = 0; s < 4; s++) {
            if (s === seat) continue;
            expect(rebuilt.hands[s]).toEqual(truth.hands[s]);
            expect(rebuilt.hands[s]!.every((c) => c === HIDDEN)).toBe(true);
          }
          expect(rebuilt.table).toEqual(truth.table);
          expect(rebuilt.captured).toEqual(truth.captured);
          expect(rebuilt.scope).toEqual(truth.scope);
          expect(rebuilt.turn).toBe(seat);
          expect(rebuilt.lastCaptureTeam).toBe(truth.lastCaptureTeam);
          expect(rebuilt.history).toEqual(truth.history);
        }
      }
    }
  });

  it('gives the same position from the full state, from the player\'s own view mid-hand, and from the finished hand', () => {
    const states = playHand(rules, 99);
    const final = states.at(-1)!;
    const seat = 2;
    const indices = moveIndices(final.hand, seat);
    const mid = states[indices[3]! + 2]!; // a couple of moves after the seat's 4th move
    for (const index of indices.slice(0, 4)) {
      const fromFull = positionBefore(mid.hand, rules, seat, index);
      const fromView = positionBefore(viewFor(mid, [seat]).hand, rules, seat, index);
      const fromEnd = positionBefore(final.hand, rules, seat, index);
      expect(fromView).toEqual(fromFull);
      expect(fromEnd).toEqual(fromFull);
    }
  });

  it('contains nothing about the other hands or about later moves', () => {
    const states = playHand(rules, 5);
    const final = states.at(-1)!;
    const seat = 1;
    const index = moveIndices(final.hand, seat)[2]!;
    const pos = positionBefore(final.hand, rules, seat, index)!;
    const visible = new Set([...pos.hands[seat]!, ...pos.table, ...pos.captured[0], ...pos.captured[1]]);
    // Every card played from this move on by somebody else must be absent from the position.
    for (const m of final.hand.history.slice(index)) {
      if (m.seat !== seat) expect(visible.has(m.card)).toBe(false);
    }
    expect(pos.history).toHaveLength(index);
    expect(JSON.stringify(pos)).not.toContain('"leftover":{');
  });

  it('refuses when the player\'s cards are not visible', () => {
    const states = playHand(rules, 3);
    const mid = states[9]!;
    const seat = mid.hand.history[4]!.seat;
    const other = (seat + 1) & 3;
    expect(positionBefore(viewFor(mid, [other]).hand, rules, seat, 4)).toBeNull();
    expect(originalHand(viewFor(mid, [other]).hand, seat)).toBeNull();
    // ...and for an index that is not that seat's move
    expect(positionBefore(mid.hand, rules, other, 4)).toBeNull();
  });
});
