import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  HIDDEN,
  createMatch,
  legalMoves,
  makeRng,
  moveError,
  nextHand,
  playMove,
  rankOf,
  viewFor,
  type MatchState,
} from '../engine';
import { c, cs, makeHand, makeMatch } from '../engine/testUtils';
import { determinize, track } from './difficile';
import { chooseFacile, chooseMedio, chooseMove, type AiLevel } from './index';

describe('Facile', () => {
  it('always takes an available scopa', () => {
    const hand = makeHand({ hands: [cs('7C 2C 5D 9S 10B'), cs('1D'), cs('2D'), cs('3D')], table: cs('3S 4B') });
    for (let seed = 0; seed < 50; seed++) {
      const move = chooseFacile(hand, 0, makeRng(seed));
      expect(move.card).toBe(c('7C'));
      expect([...move.capture].sort()).toEqual(cs('3S 4B').sort());
    }
  });

  it('otherwise plays random legal moves', () => {
    const hand = makeHand({ hands: [cs('7C 2C 5D 9S 10B'), cs('1D'), cs('2D'), cs('3D')], table: cs('8S 8B') });
    const seen = new Set<number>();
    for (let seed = 0; seed < 80; seed++) {
      const move = chooseFacile(hand, 0, makeRng(seed));
      expect(moveError(hand, move)).toBeNull();
      seen.add(move.card);
    }
    expect(seen.size).toBeGreaterThan(2);
  });
});

describe('Medio', () => {
  const rules = DEFAULT_RULES;

  it('takes the settebello when it can', () => {
    const hand = makeHand({ hands: [cs('7C 2C 9S'), cs('1D 1S 1B'), cs('2D 2S 2B'), cs('3D 3C 3B')], table: cs('7D 9B') });
    const move = chooseMedio(hand, 0, rules, makeRng(1));
    expect(move).toEqual({ card: c('7C'), capture: [c('7D')] });
  });

  it('takes a scopa', () => {
    const hand = makeHand({ hands: [cs('9C 2C 5S'), cs('1D 1S 1B'), cs('2D 2S 2B'), cs('3D 3C 3B')], table: cs('4S 5B') });
    expect(chooseMedio(hand, 0, rules, makeRng(1)).card).toBe(c('9C'));
  });

  it('avoids leaving a table the next opponent can sweep', () => {
    // Laying the 2 would leave 3+2 = 5 on the table; laying the Re leaves 13 (safe).
    const hand = makeHand({ hands: [cs('2C 10C'), cs('1D 5S'), cs('2D 6S'), cs('4D 8C')], table: cs('3S') });
    expect(chooseMedio(hand, 0, rules, makeRng(1)).card).toBe(c('10C'));
  });
});

describe('Difficile', () => {
  it('tracks the unseen cards exactly', () => {
    let m = createMatch(DEFAULT_RULES, 11);
    const rng = makeRng(3);
    for (let i = 0; i < 17; i++) {
      const moves = legalMoves(m.hand);
      m = playMove(m, moves[rng.int(moves.length)]!);
    }
    const seat = m.hand.turn;
    const view = viewFor(m, [seat]);
    const t = track(view.hand, seat);
    const others = m.hand.hands.flatMap((h, s) => (s === seat ? [] : h)).sort((a, b) => a - b);
    expect(t.unseen).toEqual(others);
  });

  it('infers that a player who declined a sweep does not hold that rank', () => {
    const hand = makeHand({
      hands: [cs('2C 10C'), [HIDDEN, HIDDEN], [HIDDEN, HIDDEN], [HIDDEN, HIDDEN]],
      table: cs('3S 9B'),
      history: [{ seat: 3, card: c('9B'), captured: [], scopa: false, tableBefore: cs('3S') }],
    });
    const t = track(hand, 0);
    expect(t.voids[3]! & (1 << 3)).toBeTruthy();
    expect(t.voids[1]).toBe(0);
    for (let seed = 0; seed < 40; seed++) {
      const deal = determinize(hand, 0, t, makeRng(seed));
      expect(deal.hands[3]!.some((x) => rankOf(x) === 3)).toBe(false);
    }
  });

  it('samples deals that match the hand sizes and use every unseen card once', () => {
    let m = createMatch({ ...DEFAULT_RULES, variant: 'classico' }, 21);
    const rng = makeRng(8);
    for (let i = 0; i < 10; i++) {
      const moves = legalMoves(m.hand);
      m = playMove(m, moves[rng.int(moves.length)]!);
    }
    const seat = m.hand.turn;
    const view = viewFor(m, [seat]);
    const t = track(view.hand, seat);
    for (let seed = 0; seed < 30; seed++) {
      const deal = determinize(view.hand, seat, t, makeRng(seed));
      expect(deal.hands.map((h) => h.length)).toEqual(m.hand.hands.map((h) => h.length));
      expect(deal.hands[seat]).toEqual(m.hand.hands[seat]);
      const dealt = deal.hands.flatMap((h, s) => (s === seat ? [] : h)).sort((a, b) => a - b);
      expect(dealt).toEqual(t.unseen);
    }
  });

  it('is deterministic for a given seed and sample count', () => {
    const m = createMatch(DEFAULT_RULES, 5);
    const seat = m.hand.turn;
    const a = chooseMove(viewFor(m, [seat]), seat, { level: 'difficile', seed: 9, samples: 12 });
    const b = chooseMove(viewFor(m, [seat]), seat, { level: 'difficile', seed: 9, samples: 12 });
    expect(a).toEqual(b);
  });

  it('takes a certain scopa and does not hand one to the next opponent', () => {
    const sweep = makeMatch(
      makeHand({ hands: [cs('9C 2C 5S'), cs('1D 1S 1B'), cs('2D 2S 2B'), cs('3D 3C 3B')], table: cs('4S 5B') }),
    );
    expect(chooseMove(viewFor(sweep, [0]), 0, { level: 'difficile', seed: 1, samples: 20 }).card).toBe(c('9C'));
  });
});

describe('every level', () => {
  it.each<AiLevel>(['facile', 'medio', 'difficile'])('%s cannot see hidden cards', (level) => {
    // The same position with the other hands swapped around must give the same answer.
    const m = createMatch(DEFAULT_RULES, 77);
    const seat = m.hand.turn;
    const swapped: MatchState = {
      ...m,
      hand: {
        ...m.hand,
        hands: m.hand.hands.map((h, s) => (s === seat ? h : m.hand.hands[[0, 1, 2, 3].filter((x) => x !== seat && x !== s)[0]!]!)),
      },
    };
    const opts = { level, seed: 4, samples: 8 };
    expect(chooseMove(m, seat, opts)).toEqual(chooseMove(swapped, seat, opts));
    expect(chooseMove(m, seat, opts)).toEqual(chooseMove(viewFor(m, [seat]), seat, opts));
  });

  it.each<AiLevel>(['facile', 'medio', 'difficile'])('%s plays whole matches with only legal moves', (level) => {
    let m = createMatch({ ...DEFAULT_RULES, target: 11, variant: 'classico', napola: true, reBello: true }, 314);
    let steps = 0;
    while (m.phase !== 'matchEnd' && steps < 2000) {
      if (m.phase === 'handEnd') {
        m = nextHand(m);
        continue;
      }
      const seat = m.hand.turn;
      const move = chooseMove(viewFor(m, [seat]), seat, { level, seed: steps, samples: 4 });
      expect(moveError(m.hand, move)).toBeNull();
      m = playMove(m, move);
      steps++;
    }
    expect(m.phase).toBe('matchEnd');
  });

  it('refuses to move out of turn', () => {
    const m = createMatch(DEFAULT_RULES, 1);
    const other = (m.hand.turn + 1) & 3;
    expect(() => chooseMove(m, other, { level: 'medio', seed: 1 })).toThrow();
  });
});
