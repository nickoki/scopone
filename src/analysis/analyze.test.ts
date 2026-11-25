import { describe, expect, it } from 'vitest';
import { chooseMove } from '../ai';
import {
  DEFAULT_RULES,
  HIDDEN,
  createMatch,
  makeRng,
  playMove,
  shuffle,
  viewFor,
  type HandState,
  type MatchState,
  type PlayedMove,
  type Rules,
} from '../engine';
import { c, cs, makeHand } from '../engine/testUtils';
import { analyseDecision, analyseHand, analyseMove, analysePosition, crossFittedLoss, type AnalysisBudget } from './analyze';
import { exactKnowledge, track } from '../ai/difficile';
import { pNextHas } from '../ai/heuristics';
import { factsFor } from './facts';
import { decisionAt, moveIndices, positionBefore } from './positions';
import { accuracyOf, classOf, creditedLoss, handScore, weightOf } from './scoring';
import type { MoveReview } from './types';

const QUICK: AnalysisBudget = { first: 60, batch: 60, max: 240, precision: 0.06, exhaustive: 600 };

function playHand(rules: Rules, seed: number): { final: MatchState; before: MatchState[] } {
  let m = createMatch(rules, seed);
  const before: MatchState[] = [];
  let step = 0;
  while (!m.hand.done) {
    const s = m.hand.turn;
    before.push(m);
    m = playMove(m, chooseMove(viewFor(m, [s]), s, { level: s % 2 ? 'medio' : 'facile', seed: seed * 50 + step++ }));
  }
  return { final: m, before };
}

const played = (seat: number, card: string, captured = '', tableBefore = ''): PlayedMove => ({
  seat: seat as PlayedMove['seat'],
  card: c(card),
  captured: cs(captured),
  scopa: false,
  tableBefore: cs(tableBefore),
});

describe('the analysis only uses what the player could know', () => {
  const rules: Rules = { ...DEFAULT_RULES, variant: 'classico' };
  const { final, before } = playHand(rules, 4242);
  const seat = 2;

  it('gives the same result whatever the other three really hold', () => {
    for (const index of moveIndices(final.hand, seat).slice(0, 6)) {
      const pos = positionBefore(final.hand, rules, seat, index)!;
      const expected = analysePosition(pos, rules, final.hand.history[index]!, index, QUICK);

      // the real hidden cards put back in
      const real: HandState = { ...pos, hands: pos.hands.map((h, s) => (s === seat ? h : before[index]!.hand.hands[s]!.slice())) };
      expect(analysePosition(real, rules, final.hand.history[index]!, index, QUICK)).toEqual(expected);

      // ...and dealt differently among the other three
      const others = [0, 1, 2, 3].filter((s) => s !== seat);
      const pool = shuffle(others.flatMap((s) => real.hands[s]!), makeRng(index + 7));
      let p = 0;
      const shuffled: HandState = { ...real, hands: real.hands.map((h, s) => (s === seat ? h : pool.slice(p, (p += h.length)))) };
      expect(analysePosition(shuffled, rules, final.hand.history[index]!, index, QUICK)).toEqual(expected);
    }
  });

  it('gives the same result mid-hand from the player\'s own view as after the hand', () => {
    const indices = moveIndices(final.hand, seat);
    const index = indices[2]!;
    const midView = viewFor(before[index + 1]!, [seat]); // right after the move, as the player's device sees it
    expect(analyseMove(midView.hand, rules, index, QUICK)).toEqual(analyseMove(final.hand, rules, index, QUICK));
  });

  it('cannot analyse a player whose cards are hidden', () => {
    const index = moveIndices(final.hand, seat)[1]!;
    const otherView = viewFor(before[index + 1]!, [(seat + 1) & 3]);
    expect(otherView.hand.hands[seat]!.every((x) => x === HIDDEN)).toBe(true);
    expect(analyseMove(otherView.hand, rules, index, QUICK)).toBeNull();
  });

  it('reviews a whole hand: one entry per move, forced moves unscored, score between 0 and 10', () => {
    const review = analyseHand(final.hand, rules, seat, 1, QUICK)!;
    expect(review.complete).toBe(true);
    expect(review.moves).toHaveLength(9);
    expect(review.moves.map((m) => m.index)).toEqual(moveIndices(final.hand, seat));
    for (const m of review.moves) {
      expect(m.loss).toBeGreaterThanOrEqual(0);
      expect(m.accuracy).toBeGreaterThanOrEqual(0);
      expect(m.accuracy).toBeLessThanOrEqual(100);
      expect(m.options[m.played]).toBeDefined();
      if (m.options.length === 1) expect(m.cls).toBe('forced');
      // the option list is ordered best first, by how far behind the best each move is
      expect(m.options[0]!.delta).toBe(0);
      for (let i = 2; i < m.options.length; i++) expect(m.options[i]!.delta).toBeLessThanOrEqual(m.options[i - 1]!.delta);
      for (const o of m.options) expect(o.delta).toBeLessThanOrEqual(0);
    }
    expect(review.score).not.toBeNull();
    expect(review.score!).toBeGreaterThanOrEqual(0);
    expect(review.score!).toBeLessThanOrEqual(10);
  });
});

describe('verdicts on clear-cut positions', () => {
  const rules = DEFAULT_RULES;
  // Six cards each; nothing is known about the other hands.
  const hidden = (n: number) => Array<number>(n).fill(HIDDEN);

  it('missing a scopa is a blunder, and the review says so', () => {
    const pos = makeHand({
      hands: [cs('7C 2C 9S 10B 4D 6S'), hidden(6), hidden(6), hidden(6)],
      table: cs('3S 4B'),
      turn: 0,
      dealer: 3,
    });
    const r = analysePosition(pos, rules, played(0, '10B', '', '3S 4B'), 16, QUICK);
    expect(r.options[0]!.move.card).toBe(c('7C'));
    expect(r.options[0]!.facts.scopa).toBe(true);
    expect(r.cls).toBe('blunder');
    expect(r.loss).toBeGreaterThan(0.8);
    expect(r.reasons.map((x) => x.code)).toContain('missedScopa');
  });

  it('taking the scopa is the best move', () => {
    const pos = makeHand({ hands: [cs('7C 2C 9S 10B 4D 6S'), hidden(6), hidden(6), hidden(6)], table: cs('3S 4B'), turn: 0, dealer: 3 });
    const r = analysePosition(pos, rules, played(0, '7C', '3S 4B', '3S 4B'), 16, QUICK);
    expect(r.played).toBe(0);
    expect(r.loss).toBe(0);
    expect(r.accuracy).toBe(100);
    expect(['best', 'brilliant']).toContain(r.cls);
    expect(r.reasons.map((x) => x.code)).toContain('tookScopa');
  });

  it('handing the next player an easy sweep is explained with the odds and the card count', () => {
    // Laying the Ace leaves 3 + 4 + 1 = 8: all four Fanti are among the 18 unseen cards,
    // and the next player holds 6 of those. The Re leaves 17 (safe).
    const pos = makeHand({
      hands: [cs('1B 2C 5B 6S 9C 10S'), hidden(6), hidden(6), hidden(6)],
      table: cs('3D 4C'),
      captured: [cs('1D 2D 4D 5D 6D 7D 9D 10D'), cs('1C 3C 5C 6C 7C 10C')],
      turn: 0,
      dealer: 3,
    });
    // 18 unseen cards, 4 of them Fanti, 6 with the next player: 1 - C(14,6) / C(18,6) = 1 - 3003 / 18564
    const exact = 1 - 3003 / 18564;
    const kn = exactKnowledge(pos, 0, track(pos, 0));
    const facts = factsFor(pos, 0, rules, { card: c('1B'), capture: [] }, kn.others, (rank) => pNextHas(kn, rank));
    expect(facts.sweepRank).toBe(8);
    expect(facts.sweepOut).toBe(4);
    expect(facts.sweepChance).toBeCloseTo(exact, 9);
    const safe = factsFor(pos, 0, rules, { card: c('10S'), capture: [] }, kn.others, (rank) => pNextHas(kn, rank));
    expect(safe.sweepRank).toBe(0);
    expect(safe.leftSum).toBe(17);

    const r = analysePosition(pos, rules, played(0, '1B', '', '3D 4C'), 16, QUICK);
    expect(['mistake', 'blunder']).toContain(r.cls);
    const gift = r.reasons.find((x) => x.code === 'sweepGift');
    expect(gift).toMatchObject({ sum: 8, out: 4 });
    // The printed odds are the share of the analysis's own deals: close to the exact 84%.
    const shown = (gift as { pct: number }).pct;
    expect(Math.abs(shown - 100 * exact)).toBeLessThan(6);
  });

  it('when every move is worth the same there is nothing to score', () => {
    // Last round, dealer to play last: whatever is laid, the leftovers go to the same side.
    const pos = makeHand({
      hands: [cs('5C 6C'), hidden(1), hidden(1), hidden(1)],
      table: cs('10B 9S 8S'),
      captured: [cs('1D 2D 3D 4D 5D 6D 7D 8D 9D 10D 1C 2C 3C 4C 7C 8C'), cs('9C 10C 1S 2S 3S 4S 5S 6S 7S 10S 1B 2B 3B 4B')],
      lastCaptureTeam: 0,
      turn: 0,
      dealer: 3,
    });
    const r = analysePosition(pos, rules, played(0, '5C', '', '10B 9S 8S'), 33, QUICK);
    if (r.even) {
      expect(r.cls).toBe('forced');
      expect(r.weight).toBe(0);
      expect(r.options.every((o) => o.delta > -0.05)).toBe(true);
    } else {
      // if the two cards are not equivalent after all, the gap must be real
      expect(Math.max(...r.options.map((o) => -o.delta))).toBeGreaterThanOrEqual(0.05);
    }
  });

  it('a single legal move is forced and does not count', () => {
    const pos = makeHand({ hands: [cs('7C'), hidden(1), hidden(1), hidden(1)], table: cs('3S 4B 9D'), turn: 0, dealer: 3 });
    const r = analysePosition(pos, rules, played(0, '7C', '3S 4B', '3S 4B 9D'), 36, QUICK);
    expect(r.cls).toBe('forced');
    expect(r.weight).toBe(0);
    expect(handScore([r])).toBeNull();
  });

  it('late in the hand every possible deal is played: no sampling error', () => {
    const pos = makeHand({
      hands: [cs('7C 2C'), hidden(2), hidden(2), hidden(2)],
      table: cs('3S 4B'),
      captured: [cs('1D 2D 3D 4D 5D 6D 7D 8D 9D 10D 1C 3C 4C 5C 6C'), cs('8C 9C 10C 1S 2S 4S 5S 6S 7S 8S 9S 10S 1B 2B 3B')],
      turn: 0,
      dealer: 3,
    });
    const a = analysePosition(pos, rules, played(0, '2C', '', '3S 4B'), 30, QUICK);
    expect(a.se).toBe(0);
    // six unseen cards dealt 2-2-2: 90 different deals, each played once
    expect(a.options.every((o) => o.samples === 90)).toBe(true);
    expect(a.options[0]!.move.card).toBe(c('7C'));
  });

  it('refuses a move that was not legal in the position', () => {
    const pos = makeHand({ hands: [cs('7C 2C'), hidden(2), hidden(2), hidden(2)], table: cs('3S 4B'), turn: 0, dealer: 3 });
    expect(() => analysePosition(pos, rules, played(0, '7C', '', '3S 4B'), 30, QUICK)).toThrow();
  });
});

describe('what leaves the device\'s game state for the analysis', () => {
  it('a Decision has the player\'s own cards and the public record up to the move - nothing else', () => {
    const rules: Rules = { ...DEFAULT_RULES, variant: 'classico' };
    const { final, before } = playHand(rules, 77);
    const seat = 1;
    const index = moveIndices(final.hand, seat)[4]!;
    // taken from the FULL state right after the move, as the online host would hold it
    const full = before[index + 1]!.hand;
    const d = decisionAt(full, seat, index)!;
    expect(Object.keys(d).sort()).toEqual(['dealer', 'dealtCounts', 'dealtHand', 'index', 'initialTable', 'played', 'prefix', 'seat']);
    expect(d.prefix).toHaveLength(index);
    expect(d.dealtHand).toHaveLength(9);
    // every card it mentions is the player's own or already public at that moment
    const allowed = new Set([...d.dealtHand, ...d.initialTable, ...d.prefix.map((m) => m.card)]);
    const mentioned = [...d.dealtHand, ...d.initialTable, ...d.prefix.flatMap((m) => [m.card, ...m.captured, ...m.tableBefore]), d.played.card, ...d.played.captured, ...d.played.tableBefore];
    for (const card of mentioned) expect(allowed.has(card)).toBe(true);
    // ...and none of the cards still hidden in the other three hands appears anywhere in it
    const text = JSON.stringify(d);
    const hiddenThen = [0, 1, 2, 3].filter((s) => s !== seat).flatMap((s) => before[index]!.hand.hands[s]!);
    const numbers = new Set((text.match(/-?\d+/g) ?? []).map(Number));
    const cardsInDecision = new Set(mentioned);
    for (const card of hiddenThen) expect(cardsInDecision.has(card)).toBe(false);
    expect(numbers.size).toBeGreaterThan(0);
    // the same decision from the player's masked view and from the finished hand
    expect(decisionAt(viewFor(before[index + 1]!, [seat]).hand, seat, index)).toEqual(d);
    expect(decisionAt(final.hand, seat, index)).toEqual(d);
    expect(analyseDecision(d, rules, [0, 0], QUICK)).toEqual(analyseMove(final.hand, rules, index, QUICK, [0, 0]));
  });
});

describe('when the hand can decide the match', () => {
  it('a move that costs points but not the match is not called a mistake', () => {
    // Our side needs one more point to win at 11 and the settebello already in our pile gives it:
    // every continuation wins the match, so giving the next player a scopa cannot be an error.
    const rules: Rules = { ...DEFAULT_RULES, target: 11 };
    const hidden = (n: number) => Array<number>(n).fill(HIDDEN);
    const pos = makeHand({
      hands: [cs('1B 2C 5B 6S 9C 10S'), hidden(6), hidden(6), hidden(6)],
      table: cs('3D 4C'),
      captured: [cs('1D 2D 4D 5D 6D 7D 9D 10D'), cs('1C 3C 5C 6C 7C 10C')],
      turn: 0,
      dealer: 3,
    });
    const move = played(0, '1B', '', '3D 4C');
    const plain = analysePosition(pos, rules, move, 16, QUICK);
    expect(['mistake', 'blunder']).toContain(plain.cls);
    // 10 points already, the opponents on 2: whatever happens in this hand, we reach 11 and they cannot catch up
    const safe = analysePosition(pos, rules, move, 16, QUICK, [10, 2]);
    expect(safe.matchSafe).toBe(true);
    expect(['best', 'good']).toContain(safe.cls);
    expect(safe.accuracy).toBeGreaterThan(85);
    // far from the target the guard does nothing
    expect(analysePosition(pos, rules, move, 16, QUICK, [0, 0])).toEqual(plain);
  });
});

describe('cross-fitted loss', () => {
  // Two moves with the same true value: whichever looks better by chance must not be "better".
  it('does not charge the truly best move when a rival only looks better by luck', () => {
    const rng = makeRng(11);
    const noise = () => (rng.next() + rng.next() + rng.next() - 1.5) * 4;
    let naive = 0;
    let fitted = 0;
    const rounds = 300;
    for (let r = 0; r < rounds; r++) {
      const values = [0, 1, 2, 3].map(() => Array.from({ length: 160 }, noise));
      const means = values.map((v) => v.reduce((a, b) => a + b, 0) / v.length);
      naive += Math.max(...means) - means[0]!;
      fitted += crossFittedLoss(values, [0, 1, 2, 3], 0).loss;
    }
    expect(naive / rounds).toBeGreaterThan(0.1); // the naive gap is biased upwards
    expect(Math.abs(fitted / rounds)).toBeLessThan(0.04); // the cross-fitted one is not
  });

  it('still measures a real gap', () => {
    const rng = makeRng(5);
    const values = [0, 1].map((i) => Array.from({ length: 400 }, () => (rng.next() - 0.5) * 2 + (i === 1 ? 0.8 : 0)));
    const r = crossFittedLoss(values, [0, 1], 0);
    expect(r.loss).toBeGreaterThan(0.7);
    expect(r.loss).toBeLessThan(0.9);
    expect(r.se).toBeLessThan(0.1);
    // the better move, judged against itself in both halves, gives up nothing
    expect(crossFittedLoss(values, [0, 1], 1)).toEqual({ loss: 0, se: 0 });
  });
});

describe('scoring', () => {
  it('gives the benefit of the doubt to gaps that could be noise', () => {
    expect(creditedLoss(0.07, 0)).toBe(0);
    expect(creditedLoss(0.2, 0.25)).toBe(0);
    expect(creditedLoss(0.5, 0.1)).toBeCloseTo(0.4);
    // continuous: no jump just above the allowance
    expect(creditedLoss(0.1, 0.02)).toBeCloseTo(0.02);
    expect(creditedLoss(1, 0)).toBeCloseTo(0.92);
  });

  it('maps credited loss to accuracy and class', () => {
    expect(accuracyOf(0)).toBe(100);
    // the number agrees with the label: good >= 87%, inaccuracy >= 37%, mistake >= 2%
    expect(accuracyOf(0.15)).toBeGreaterThan(86);
    expect(accuracyOf(0.4)).toBeGreaterThan(36);
    expect(accuracyOf(0.4)).toBeLessThan(40);
    expect(accuracyOf(0.8)).toBeLessThan(3);
    expect(accuracyOf(1)).toBeLessThan(1);
    expect(classOf(0)).toBe('best');
    expect(classOf(0.1)).toBe('good');
    expect(classOf(0.3)).toBe('inaccuracy');
    expect(classOf(0.6)).toBe('mistake');
    expect(classOf(1.2)).toBe('blunder');
  });

  it('weights decisions by what was at stake, within limits', () => {
    expect(weightOf(0)).toBe(0.2);
    expect(weightOf(0.7)).toBe(0.7);
    expect(weightOf(4)).toBe(1.5);
    const mv = (accuracy: number, weight: number, cls: MoveReview['cls'] = 'good') => ({ accuracy, weight, cls }) as MoveReview;
    // an error on a big decision outweighs perfect play on small ones
    expect(handScore([mv(100, 0.2), mv(100, 0.2), mv(0, 1.5)])).toBeCloseTo(2.1, 1);
    expect(handScore([mv(72, 1), mv(72, 0.3)])).toBe(7.2);
    expect(handScore([mv(100, 0, 'forced')])).toBeNull();
    expect(handScore([])).toBeNull();
  });
});
