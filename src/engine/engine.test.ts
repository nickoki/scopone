import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  HIDDEN,
  PRIMIERA_VALUE,
  capturesFor,
  createMatch,
  dealHand,
  handIntegrityError,
  legalMoves,
  makeRng,
  matchWinner,
  moveError,
  napolaRun,
  nextHand,
  playMove,
  primiera,
  rankOf,
  scoreHand,
  suitOf,
  sweepRank,
  teamOf,
  viewFor,
  type CardId,
  type MatchState,
  type Rules,
} from './index';
import { c, cs, makeHand, makeMatch } from './testUtils';

const sortSets = (sets: CardId[][]) =>
  sets.map((s) => [...s].sort((a, b) => a - b)).sort((a, b) => a.join().localeCompare(b.join()));

describe('deck', () => {
  it('has 40 cards: 4 suits x ranks 1..10', () => {
    const seen = new Set<string>();
    for (let id = 0; id < 40; id++) seen.add(`${suitOf(id)}-${rankOf(id)}`);
    expect(seen.size).toBe(40);
    expect(suitOf(c('7D'))).toBe('denari');
    expect(suitOf(c('1C'))).toBe('coppe');
    expect(suitOf(c('8S'))).toBe('spade');
    expect(suitOf(c('10B'))).toBe('bastoni');
    expect(rankOf(c('10B'))).toBe(10);
  });
});

describe('capture rules', () => {
  it('rank match first: a 7 must take the single 7, not 3+4', () => {
    const caps = capturesFor(c('7C'), cs('7S 3D 4B'));
    expect(caps).toEqual([[c('7S')]]);
  });

  it('rank match first applies to face cards too (Re takes Re, not 7+3)', () => {
    expect(capturesFor(c('10C'), cs('7D 3S 10B'))).toEqual([[c('10B')]]);
  });

  it('with two cards of the same rank the player chooses which single card to take', () => {
    const caps = capturesFor(c('5C'), cs('5D 5S 2B 3B'));
    expect(sortSets(caps)).toEqual(sortSets([[c('5D')], [c('5S')]]));
  });

  it('never takes two same-rank cards at once', () => {
    for (const cap of capturesFor(c('5C'), cs('5D 5S'))) expect(cap).toHaveLength(1);
  });

  it('without a rank match any set summing to the value may be taken', () => {
    const caps = capturesFor(c('7C'), cs('3D 4B 1S 6S 2D'));
    expect(sortSets(caps)).toEqual(
      sortSets([cs('3D 4B'), cs('1S 6S'), cs('4B 1S 2D')]),
    );
  });

  it('sum captures may use three or more cards', () => {
    expect(sortSets(capturesFor(c('10D'), cs('1C 2C 3C 4C')))).toEqual(sortSets([cs('1C 2C 3C 4C')]));
  });

  it('a card that captures nothing has no captures', () => {
    expect(capturesFor(c('2C'), cs('5D 9S'))).toEqual([]);
    expect(capturesFor(c('1C'), cs('5D 9S'))).toEqual([]);
    expect(capturesFor(c('4C'), [])).toEqual([]);
  });

  it('legalMoves lists one move per capture option, or a lay-down', () => {
    const hand = makeHand({ hands: [cs('7C 2C'), [], [], []], table: cs('3D 4B 1S 6S') });
    const moves = legalMoves(hand);
    const seven = moves.filter((m) => m.card === c('7C'));
    const two = moves.filter((m) => m.card === c('2C'));
    expect(seven).toHaveLength(2);
    expect(two).toEqual([{ card: c('2C'), capture: [] }]);
  });

  it('capturing is mandatory when the played card can capture', () => {
    const hand = makeHand({ hands: [cs('7C'), cs('1D'), cs('2D'), cs('3D')], table: cs('3S 4B') });
    expect(moveError(hand, { card: c('7C'), capture: [] })).toMatch(/mandatory/);
    expect(moveError(hand, { card: c('7C'), capture: cs('4B 3S') })).toBeNull();
  });

  it('rejects a sum capture when a rank match exists', () => {
    const hand = makeHand({ hands: [cs('7C'), cs('1D'), cs('2D'), cs('5D')], table: cs('7S 3S 4B') });
    expect(moveError(hand, { card: c('7C'), capture: cs('3S 4B') })).toMatch(/illegal capture/);
    expect(moveError(hand, { card: c('7C'), capture: cs('7S') })).toBeNull();
  });

  it('rejects cards not in hand, wrong turn and bogus captures', () => {
    const hand = makeHand({ hands: [cs('7C'), cs('1D'), cs('2D'), cs('5D')], table: cs('3S 4B') });
    expect(moveError(hand, { card: c('6C'), capture: [] })).toMatch(/not in hand/);
    expect(moveError(hand, { card: c('1D'), capture: [] }, 1)).toMatch(/turn/);
    expect(moveError(hand, { card: c('7C'), capture: cs('3S') })).toMatch(/illegal/);
    expect(moveError(hand, { card: c('7C'), capture: cs('3S 3S 1D') })).toMatch(/duplicate/);
    expect(() => playMove(makeMatch(hand), { card: c('7C'), capture: [] })).toThrow(/Illegal move/);
  });

  it('a card that captures nothing stays on the table', () => {
    const m = makeMatch(makeHand({ hands: [cs('2C'), cs('1D'), cs('2D'), cs('5D')], table: cs('5S 9S') }));
    const after = playMove(m, { card: c('2C'), capture: [] });
    expect(after.hand.table).toEqual(cs('5S 9S 2C'));
    expect(after.hand.captured).toEqual([[], []]);
    expect(after.hand.lastCaptureTeam).toBeNull();
  });

  it('captured cards and the played card go to the capturing team', () => {
    const m = makeMatch(
      makeHand({ hands: [cs('1D'), cs('7C'), cs('2D'), cs('5D')], table: cs('3S 4B 9D'), turn: 1 }),
    );
    const after = playMove(m, { card: c('7C'), capture: cs('3S 4B') });
    expect(after.hand.table).toEqual(cs('9D'));
    expect([...after.hand.captured[1]].sort()).toEqual(cs('3S 4B 7C').sort());
    expect(after.hand.captured[0]).toEqual([]);
    expect(after.hand.lastCaptureTeam).toBe(1);
    expect(after.hand.scope).toEqual([0, 0]);
  });

  it('playMove is pure', () => {
    const m = makeMatch(makeHand({ hands: [cs('2C'), cs('1D'), cs('2D'), cs('5D')], table: cs('5S') }));
    const snapshot = JSON.stringify(m);
    playMove(m, { card: c('2C'), capture: [] });
    expect(JSON.stringify(m)).toBe(snapshot);
  });

  it('sweepRank reports the rank that would clear the table', () => {
    expect(sweepRank(cs('3D 4B'))).toBe(7);
    expect(sweepRank(cs('10D'))).toBe(10);
    expect(sweepRank(cs('10D 1C'))).toBe(0);
    expect(sweepRank([])).toBe(0);
  });
});

describe('scopa', () => {
  it('clearing the table scores a scopa', () => {
    const m = makeMatch(makeHand({ hands: [cs('7C 1C'), cs('1D'), cs('2D'), cs('5D')], table: cs('3S 4B') }));
    const after = playMove(m, { card: c('7C'), capture: cs('3S 4B') });
    expect(after.hand.table).toEqual([]);
    expect(after.hand.scope).toEqual([1, 0]);
    expect(after.hand.history.at(-1)?.scopa).toBe(true);
  });

  it('a capture that leaves cards behind is not a scopa', () => {
    const m = makeMatch(makeHand({ hands: [cs('7C 1C'), cs('1D'), cs('2D'), cs('5D')], table: cs('7S 4B') }));
    const after = playMove(m, { card: c('7C'), capture: cs('7S') });
    expect(after.hand.scope).toEqual([0, 0]);
  });

  const lastCardSetup = (rules: Partial<Rules>): MatchState =>
    makeMatch(
      makeHand({
        hands: [[], [], [], cs('7C')],
        table: cs('3S 4B'),
        turn: 3,
        dealer: 3,
        captured: [cs('1D 2D 3D 4D 5D 6D 7D 8D 9D 10D 1C 2C 3C 4C 5C 6C 8C 9C 10C'), cs('1S 2S 5S 6S 7S 8S 9S 10S 1B 2B 3B 5B 6B 7B 8B 9B 10B')],
        lastCaptureTeam: 0,
      }),
      rules,
    );

  it('toggle on (default): a sweep with the very last card of the hand does not count', () => {
    expect(DEFAULT_RULES.lastCardScopaExcluded).toBe(true);
    const after = playMove(lastCardSetup({ lastCardScopaExcluded: true }), { card: c('7C'), capture: cs('3S 4B') });
    expect(after.hand.done).toBe(true);
    expect(after.hand.scope).toEqual([0, 0]);
    expect(after.hand.history.at(-1)?.scopa).toBe(false);
    expect(after.handScores[0]!.points.scope).toEqual([0, 0]);
  });

  it('toggle off: a sweep with the very last card counts', () => {
    const after = playMove(lastCardSetup({ lastCardScopaExcluded: false }), { card: c('7C'), capture: cs('3S 4B') });
    expect(after.hand.scope).toEqual([0, 1]);
    expect(after.handScores[0]!.points.scope).toEqual([0, 1]);
  });

  it('the toggle only affects the final card: a sweep on the second-to-last card still counts', () => {
    const m = makeMatch(
      makeHand({ hands: [[], [], cs('7C'), cs('9B')], table: cs('3S 4B'), turn: 2, dealer: 3 }),
      { lastCardScopaExcluded: true },
    );
    const after = playMove(m, { card: c('7C'), capture: cs('3S 4B') });
    expect(after.hand.scope).toEqual([1, 0]);
  });
});

describe('end of hand', () => {
  it('cards left on the table go to the last team that captured', () => {
    const m = makeMatch(
      makeHand({
        hands: [[], [], [], cs('2C')],
        table: cs('5S 9S'),
        turn: 3,
        captured: [cs('1D 2D'), cs('3D 3S')],
        lastCaptureTeam: 0,
      }),
    );
    const after = playMove(m, { card: c('2C'), capture: [] });
    expect(after.hand.done).toBe(true);
    expect(after.hand.table).toEqual([]);
    expect(after.hand.leftover).toEqual({ team: 0, cards: cs('5S 9S 2C') });
    expect(after.hand.captured[0]).toEqual(cs('1D 2D 5S 9S 2C'));
    expect(after.hand.captured[1]).toEqual(cs('3D 3S'));
    expect(after.phase).toBe('handEnd');
  });

  it('a final capture makes that team the last capturer for the leftovers', () => {
    const m = makeMatch(
      makeHand({
        hands: [[], [], [], cs('5C')],
        table: cs('5S 9S'),
        turn: 3,
        captured: [cs('1D 2D'), []],
        lastCaptureTeam: 0,
      }),
    );
    const after = playMove(m, { card: c('5C'), capture: cs('5S') });
    expect(after.hand.leftover).toEqual({ team: 1, cards: cs('9S') });
    expect(after.hand.captured[1]).toEqual(cs('5S 5C 9S'));
  });
});

describe('scoring', () => {
  const rules: Rules = { ...DEFAULT_RULES };
  const all = (suit: string, ranks: number[]) => ranks.map((r) => c(`${r}${suit}`));

  it('carte: most cards wins; 20-20 gives no point', () => {
    const a = [...all('C', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), ...all('S', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), c('8B')];
    const b = [...all('D', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), ...all('B', [1, 2, 3, 4, 5, 6, 7, 9, 10])];
    const s = scoreHand([a, b], [0, 0], rules);
    expect(s.detail[0].cards).toBe(21);
    expect(s.detail[1].cards).toBe(19);
    expect(s.points.carte).toEqual([1, 0]);

    const tie = scoreHand([a.slice(0, 20), [...b, c('8B')]], [0, 0], rules);
    expect(tie.points.carte).toEqual([0, 0]);
  });

  it('denari: most Coins wins; 5-5 gives no point', () => {
    const s = scoreHand([all('D', [1, 2, 3, 4, 5, 8]), all('D', [6, 7, 9, 10])], [0, 0], rules);
    expect(s.points.denari).toEqual([1, 0]);
    const tie = scoreHand([all('D', [1, 2, 3, 4, 5]), all('D', [6, 7, 8, 9, 10])], [0, 0], rules);
    expect(tie.detail[0].denari).toBe(5);
    expect(tie.points.denari).toEqual([0, 0]);
  });

  it('settebello: the 7 of Coins is worth a point', () => {
    const s = scoreHand([cs('7D'), cs('7C 7S 7B')], [0, 0], rules);
    expect(s.points.settebello).toEqual([1, 0]);
    const t = scoreHand([cs('7C'), cs('7D')], [0, 0], rules);
    expect(t.points.settebello).toEqual([0, 1]);
  });

  it('primiera uses 7=21, 6=18, A=16, 5=15, 4=14, 3=13, 2=12, faces=10', () => {
    expect(PRIMIERA_VALUE.slice(1)).toEqual([16, 12, 13, 14, 15, 18, 21, 10, 10, 10]);
    expect(primiera(cs('7D 6C 1S 5B')).total).toBe(21 + 18 + 16 + 15);
    expect(primiera(cs('4D 3C 2S 8B')).total).toBe(14 + 13 + 12 + 10);
    expect(primiera(cs('9D 10C')).total).toBe(20);
  });

  it('primiera takes only the best card of each suit', () => {
    const p = primiera(cs('7D 6D 1D 2C 10C 5S 4S 8B'));
    expect(p.best).toEqual([c('7D'), c('2C'), c('5S'), c('8B')]);
    expect(p.total).toBe(21 + 12 + 15 + 10);
  });

  it('primiera: the higher total wins the point', () => {
    const s = scoreHand([cs('7D 7C 6S 1B'), cs('7S 7B 6D 6C')], [0, 0], rules);
    expect(s.detail[0].primiera).toBe(76);
    expect(s.detail[1].primiera).toBe(78);
    expect(s.points.primiera).toEqual([0, 1]);
  });

  it('primiera tie: nobody scores', () => {
    const s = scoreHand([cs('7D 7C 6S 6B'), cs('7S 7B 6D 6C')], [0, 0], rules);
    expect(s.detail[0].primiera).toBe(78);
    expect(s.detail[1].primiera).toBe(78);
    expect(s.points.primiera).toEqual([0, 0]);
  });

  it('primiera tie through different cards: 7+5 equals 6+6', () => {
    const s = scoreHand([cs('7D 5C'), cs('6S 6B')], [0, 0], rules);
    expect(s.detail[0].primiera).toBe(36);
    expect(s.detail[1].primiera).toBe(36);
    expect(s.points.primiera).toEqual([0, 0]);
  });

  it('primiera: a missing suit simply counts zero', () => {
    const s = scoreHand([cs('7D 7C 7S'), cs('2D 2C 2S 2B')], [0, 0], rules);
    expect(s.detail[0].primiera).toBe(63);
    expect(s.detail[0].primieraCards[3]).toBeNull();
    expect(s.detail[1].primiera).toBe(48);
    expect(s.points.primiera).toEqual([1, 0]);
  });

  it('scope: one point each', () => {
    const s = scoreHand([cs('2C'), cs('3C')], [3, 1], rules);
    expect(s.points.scope).toEqual([3, 1]);
  });

  it('re bello: only when enabled', () => {
    expect(scoreHand([cs('10D'), []], [0, 0], rules).points.reBello).toEqual([0, 0]);
    expect(scoreHand([cs('10D'), []], [0, 0], { ...rules, reBello: true }).points.reBello).toEqual([1, 0]);
    expect(scoreHand([[], cs('10D')], [0, 0], { ...rules, reBello: true }).points.reBello).toEqual([0, 1]);
  });

  it('total is the sum of every category', () => {
    const a = [...all('D', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), ...all('C', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), c('7S')];
    const b = [...all('S', [1, 2, 3, 4, 5, 6, 8, 9, 10]), ...all('B', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])];
    const s = scoreHand([a, b], [2, 1], { ...rules, reBello: true, napola: true });
    // carte 1, denari 1, settebello 1, primiera 1 (63+... vs), scope 2, re bello 1, napola 10
    expect(s.points.carte).toEqual([1, 0]);
    expect(s.points.denari).toEqual([1, 0]);
    expect(s.points.settebello).toEqual([1, 0]);
    expect(s.points.primiera).toEqual([1, 0]);
    expect(s.points.napola).toEqual([10, 0]);
    expect(s.total).toEqual([1 + 1 + 1 + 1 + 2 + 1 + 10, 1]);
  });

  it('a full 40-card split always yields consistent category totals', () => {
    const rng = makeRng(7);
    for (let n = 0; n < 200; n++) {
      const a: CardId[] = [];
      const b: CardId[] = [];
      for (let id = 0; id < 40; id++) (rng.next() < 0.5 ? a : b).push(id);
      const s = scoreHand([a, b], [0, 0], rules);
      expect(s.points.carte[0] + s.points.carte[1]).toBeLessThanOrEqual(1);
      expect(s.points.denari[0] + s.points.denari[1]).toBeLessThanOrEqual(1);
      expect(s.points.settebello[0] + s.points.settebello[1]).toBe(1);
      expect(s.points.primiera[0] + s.points.primiera[1]).toBeLessThanOrEqual(1);
      expect(s.total[0] + s.total[1]).toBeLessThanOrEqual(4);
    }
  });
});

describe('napola', () => {
  const on: Rules = { ...DEFAULT_RULES, napola: true };
  const coins = (n: number) => Array.from({ length: n }, (_, i) => c(`${i + 1}D`));

  it('needs Ace, 2 and 3 of Coins', () => {
    expect(napolaRun(cs('1D'))).toBe(0);
    expect(napolaRun(cs('1D 2D'))).toBe(0);
    expect(napolaRun(cs('2D 3D 4D'))).toBe(0);
    expect(napolaRun(cs('1D 3D 4D'))).toBe(0);
    expect(napolaRun(cs('1C 2C 3C'))).toBe(0);
  });

  it.each([3, 4, 5, 6, 7, 8, 9, 10])('a run of %i Coins from the Ace scores %i points', (n) => {
    expect(napolaRun(coins(n))).toBe(n);
    expect(scoreHand([coins(n), []], [0, 0], on).points.napola).toEqual([n, 0]);
    expect(scoreHand([[], coins(n)], [0, 0], on).points.napola).toEqual([0, n]);
  });

  it('the run stops at the first gap', () => {
    expect(napolaRun(cs('1D 2D 3D 5D 6D 7D'))).toBe(3);
    expect(napolaRun(cs('1D 2D 3D 4D 5D 7D 8D 9D 10D'))).toBe(5);
  });

  it('other suits and card order do not matter', () => {
    expect(napolaRun(cs('4D 9S 3D 1C 1D 2D 7B'))).toBe(4);
  });

  it('maximum is 10 (all the Coins)', () => {
    expect(napolaRun(coins(10))).toBe(10);
  });

  it('scores nothing when the option is off', () => {
    expect(scoreHand([coins(6), []], [0, 0], { ...DEFAULT_RULES, napola: false }).points.napola).toEqual([0, 0]);
    expect(scoreHand([coins(6), []], [0, 0], { ...DEFAULT_RULES, napola: false }).detail[0].napola).toBe(6);
  });
});

describe('end of game', () => {
  it('nobody wins below the target', () => {
    expect(matchWinner([10, 9], 11)).toBeNull();
    expect(matchWinner([20, 20], 21)).toBeNull();
  });

  it('reaching the target wins', () => {
    expect(matchWinner([11, 9], 11)).toBe(0);
    expect(matchWinner([15, 21], 21)).toBe(1);
    expect(matchWinner([31, 30], 31)).toBe(0);
  });

  it('both past the target: the higher score wins', () => {
    expect(matchWinner([12, 13], 11)).toBe(1);
    expect(matchWinner([24, 22], 21)).toBe(0);
  });

  it('exact tie at or past the target: no winner yet', () => {
    expect(matchWinner([11, 11], 11)).toBeNull();
    expect(matchWinner([23, 23], 21)).toBeNull();
  });

  // Final card of a hand: team 1 (seat 3) lays a card; everything on the table
  // goes to team 0, who end with 21 cards, 6 Coins incl. settebello, and primiera.
  const finalCardMatch = (scores: [number, number], rules: Partial<Rules> = {}): MatchState =>
    makeMatch(
      makeHand({
        hands: [[], [], [], cs('2B')],
        table: cs('9B'),
        turn: 3,
        dealer: 3,
        captured: [
          cs('1D 2D 3D 4D 5D 7D 7C 7S 7B 1C 2C 3C 4C 5C 6C 8C 9C 10C 8S'),
          cs('6D 8D 9D 10D 1S 2S 3S 4S 5S 6S 9S 10S 1B 3B 4B 5B 6B 8B 10B'),
        ],
        lastCaptureTeam: 0,
      }),
      { target: 11, ...rules },
      scores,
    );

  it('hand totals are added to the running score and the hand is archived', () => {
    const after = playMove(finalCardMatch([0, 0]), { card: c('2B'), capture: [] });
    expect(after.handScores).toHaveLength(1);
    expect(after.handScores[0]!.total).toEqual([4, 0]);
    expect(after.scores).toEqual([4, 0]);
    expect(after.phase).toBe('handEnd');
    expect(after.winner).toBeNull();
  });

  it('the match ends when a team reaches the target', () => {
    const after = playMove(finalCardMatch([7, 10]), { card: c('2B'), capture: [] });
    expect(after.scores).toEqual([11, 10]);
    expect(after.phase).toBe('matchEnd');
    expect(after.winner).toBe(0);
    expect(() => nextHand(after)).toThrow();
  });

  it('both teams past the target in the same hand: higher total wins', () => {
    const m = finalCardMatch([8, 10]);
    m.hand.scope = [0, 2];
    const after = playMove(m, { card: c('2B'), capture: [] });
    expect(after.scores).toEqual([12, 12 + 0]);
    // 12-12 is a tie, see next test; make team 1 one better here:
    const m2 = finalCardMatch([8, 10]);
    m2.hand.scope = [0, 3];
    const after2 = playMove(m2, { card: c('2B'), capture: [] });
    expect(after2.scores).toEqual([12, 13]);
    expect(after2.phase).toBe('matchEnd');
    expect(after2.winner).toBe(1);
  });

  it('exact tie past the target: another hand is played', () => {
    const m = finalCardMatch([8, 10]);
    m.hand.scope = [0, 2];
    const after = playMove(m, { card: c('2B'), capture: [] });
    expect(after.scores).toEqual([12, 12]);
    expect(after.phase).toBe('handEnd');
    expect(after.winner).toBeNull();
    const next = nextHand(after);
    expect(next.phase).toBe('playing');
    expect(next.handNumber).toBe(2);
    expect(next.scores).toEqual([12, 12]);
  });
});

describe('dealing and turn order', () => {
  it('scientifico: 10 cards each, empty table', () => {
    const m = createMatch({ ...DEFAULT_RULES, variant: 'scientifico' }, 42);
    expect(m.hand.hands.map((h) => h.length)).toEqual([10, 10, 10, 10]);
    expect(m.hand.table).toEqual([]);
    expect(handIntegrityError(m.hand)).toBeNull();
  });

  it('classico: 9 cards each, 4 face up, never 3+ kings on the table', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const m = createMatch({ ...DEFAULT_RULES, variant: 'classico' }, seed);
      expect(m.hand.hands.map((h) => h.length)).toEqual([9, 9, 9, 9]);
      expect(m.hand.table).toHaveLength(4);
      expect(m.hand.initialTable).toEqual(m.hand.table);
      expect(m.hand.table.filter((x) => rankOf(x) === 10).length).toBeLessThan(3);
      expect(handIntegrityError(m.hand)).toBeNull();
    }
  });

  it('the same seed gives the same game; different seeds differ', () => {
    const a = createMatch(DEFAULT_RULES, 123);
    const b = createMatch(DEFAULT_RULES, 123);
    const d = createMatch(DEFAULT_RULES, 124);
    expect(a).toEqual(b);
    expect(a.hand.hands).not.toEqual(d.hand.hands);
  });

  it('the player to the dealer\'s right leads and play runs counter-clockwise (seat + 1)', () => {
    let m = createMatch(DEFAULT_RULES, 5, 2);
    expect(m.hand.dealer).toBe(2);
    expect(m.hand.turn).toBe(3);
    const order: number[] = [];
    for (let i = 0; i < 8; i++) {
      order.push(m.hand.turn);
      m = playMove(m, legalMoves(m.hand)[0]!);
    }
    expect(order).toEqual([3, 0, 1, 2, 3, 0, 1, 2]);
  });

  it('partners sit opposite each other', () => {
    expect(teamOf(0)).toBe(teamOf(2));
    expect(teamOf(1)).toBe(teamOf(3));
    expect(teamOf(0)).not.toBe(teamOf(1));
  });

  it('the dealer rotates each hand and deals differ', () => {
    let m = createMatch({ ...DEFAULT_RULES, target: 31 }, 9, 0);
    const first = m.hand.hands;
    while (m.phase === 'playing') m = playMove(m, legalMoves(m.hand)[0]!);
    if (m.phase === 'handEnd') {
      const n = nextHand(m);
      expect(n.hand.dealer).toBe(1);
      expect(n.hand.turn).toBe(2);
      expect(n.hand.hands).not.toEqual(first);
      expect(n.handNumber).toBe(2);
    }
  });

  it('dealHand is deterministic for a given rng state', () => {
    expect(dealHand(DEFAULT_RULES, 99, 1)).toEqual(dealHand(DEFAULT_RULES, 99, 1));
  });
});

describe('player views', () => {
  it('hide other hands and the rng', () => {
    const m = createMatch(DEFAULT_RULES, 77);
    const v = viewFor(m, [2]);
    expect(v.hand.hands[2]).toEqual(m.hand.hands[2]);
    for (const s of [0, 1, 3]) expect(v.hand.hands[s]).toEqual(Array(10).fill(HIDDEN));
    expect(v.seed).toBe(0);
    expect(v.rngState).toBe(0);
    expect(JSON.stringify(v)).not.toContain(JSON.stringify(m.hand.hands[0]));
  });

  it('do not mutate the match', () => {
    const m = createMatch(DEFAULT_RULES, 77);
    const before = JSON.stringify(m);
    viewFor(m, []);
    expect(JSON.stringify(m)).toBe(before);
  });
});

describe('random playthroughs', () => {
  it('whole matches stay consistent under random legal play', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rules: Rules = {
        variant: seed % 2 ? 'scientifico' : 'classico',
        target: 11,
        lastCardScopaExcluded: seed % 3 !== 0,
        reBello: seed % 4 === 0,
        napola: seed % 5 === 0,
      };
      const rng = makeRng(seed * 31);
      let m = createMatch(rules, seed);
      let guard = 0;
      while (m.phase !== 'matchEnd' && guard++ < 5000) {
        if (m.phase === 'handEnd') {
          m = nextHand(m);
          continue;
        }
        const moves = legalMoves(m.hand);
        expect(moves.length).toBeGreaterThan(0);
        m = playMove(m, moves[rng.int(moves.length)]!);
        expect(handIntegrityError(m.hand)).toBeNull();
        if (m.hand.done) {
          const s = m.handScores.at(-1)!;
          if (m.hand.leftover?.team !== null) expect(s.detail[0].cards + s.detail[1].cards).toBe(40);
        }
      }
      expect(m.phase).toBe('matchEnd');
      expect(m.winner).not.toBeNull();
      expect(Math.max(...m.scores)).toBeGreaterThanOrEqual(11);
      expect(m.scores[m.winner!]).toBeGreaterThan(m.scores[1 - m.winner!]!);
    }
  });
});
