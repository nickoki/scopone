import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_RULES, createMatch, playMove, viewFor, type MatchState } from '../engine';
import { chooseMove } from '../ai';
import { KEYS } from '../state/storage';
import { analyseMove } from './analyze';
import { moveIndices } from './positions';
import { slimReview, type MoveReview } from './types';
import { ANALYSIS_VERSION, KEEP_GAMES, KEEP_HANDS, MAX_CHARS, handsOf, loadGames, saveGames, type HandRecord } from './useHandReviews';

// A localStorage for the tests (they run without a browser).
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
});

const QUICK = { first: 30, batch: 30, max: 60, precision: 0.1, exhaustive: 200 };

/** A few really analysed moves of seat 0, as the app keeps them. */
function someReviews(): MoveReview[] {
  let m: MatchState = createMatch(DEFAULT_RULES, 77);
  let step = 0;
  while (!m.hand.done) m = playMove(m, chooseMove(viewFor(m, [m.hand.turn]), m.hand.turn, { level: 'medio', seed: step++ }));
  return moveIndices(m.hand, 0)
    .slice(0, 3)
    .map((index) => slimReview(analyseMove(m.hand, DEFAULT_RULES, index, QUICK)!));
}
const reviews = someReviews();

const record = (moves: MoveReview[], mine: HandRecord['mine'] = []): HandRecord => ({ moves, totals: [10, 10, 10, 10], done: true, mine, failed: [], failedSeats: [] });

describe('stored reviews', () => {
  it('come back as they were saved', () => {
    saveGames('local:a', { 1: record(reviews, [{ index: 0, card: 5 }]) }, {});
    const back = handsOf(loadGames()['local:a']);
    expect(back[1]!.moves).toEqual(reviews);
    expect(back[1]!.mine).toEqual([{ index: 0, card: 5 }]);
    expect(back[1]!.done).toBe(true);
  });

  it('of one game are not wiped by merely opening another', () => {
    saveGames('local:a', { 1: record(reviews) }, {});
    // another game's screen opens: nothing analysed, nothing played yet
    saveGames('host:1', {}, loadGames());
    saveGames('host:1', { 1: record([]) }, loadGames());
    expect(Object.keys(loadGames())).toEqual(['local:a']);
    // ...and once it has something of its own, both are kept
    saveGames('host:1', { 1: record([], [{ index: 3, card: 12 }]) }, loadGames());
    const games = loadGames();
    expect(Object.keys(games).sort()).toEqual(['host:1', 'local:a']);
    expect(handsOf(games['local:a'])[1]!.moves).toEqual(reviews);
    expect(handsOf(games['host:1'])[1]!.mine).toEqual([{ index: 3, card: 12 }]);
  });

  it(`keep at most ${KEEP_GAMES} games (the least recently used goes) and ${KEEP_HANDS} hands of each`, async () => {
    for (const key of ['g1', 'g2', 'g3', 'g4']) {
      saveGames(key, { 1: record(reviews) }, loadGames());
      await new Promise((r) => setTimeout(r, 3));
    }
    expect(Object.keys(loadGames()).sort()).toEqual(['g2', 'g3', 'g4']);
    const many: Record<number, HandRecord> = {};
    for (let n = 1; n <= KEEP_HANDS + 4; n++) many[n] = record(reviews.slice(0, 1));
    saveGames('g4', many, loadGames());
    expect(Object.keys(loadGames()['g4']!.hands).map(Number)).toEqual(Array.from({ length: KEEP_HANDS }, (_, i) => i + 5));
  });

  it('never grow beyond the size budget: other games go first, then this game\'s oldest hands', () => {
    const big = Array.from({ length: 40 }, () => reviews).flat();
    const perHand = JSON.stringify(record(big)).length;
    const handsThatFit = Math.floor(MAX_CHARS / perHand);
    expect(handsThatFit).toBeGreaterThan(1);
    saveGames('old', { 1: record(big) }, {});
    const mine: Record<number, HandRecord> = {};
    for (let n = 1; n <= handsThatFit + 3; n++) mine[n] = record(big);
    saveGames('now', mine, loadGames());
    expect(store.get(KEYS.reviews)!.length).toBeLessThanOrEqual(MAX_CHARS);
    const games = loadGames();
    expect(Object.keys(games)).toEqual(['now']);
    const kept = Object.keys(games['now']!.hands).map(Number);
    expect(kept.length).toBeLessThanOrEqual(handsThatFit);
    expect(Math.max(...kept)).toBe(handsThatFit + 3); // the newest hand is always there
    expect(kept).toEqual([...kept].sort((a, b) => a - b));
  });

  it('from another version of the analysis lose their verdicts but not the record of what the player played', () => {
    saveGames('guest:9:2', { 4: record(reviews, [{ index: 7, card: 31 }]) }, {});
    const raw = JSON.parse(store.get(KEYS.reviews)!);
    expect(raw.v).toBe(ANALYSIS_VERSION);
    raw.v = ANALYSIS_VERSION - 1;
    store.set(KEYS.reviews, JSON.stringify(raw));
    const back = handsOf(loadGames()['guest:9:2']);
    expect(back[4]!.moves).toEqual([]);
    expect(back[4]!.mine).toEqual([{ index: 7, card: 31 }]);
  });

  it('that are damaged or in an old layout are ignored, not fatal', () => {
    for (const junk of ['', 'not json', '42', 'null', '{"v":4,"gameKey":"local:x","hands":{"1":{"moves":[],"totals":[1,1,1,1]}}}', '{"v":5,"games":{"a":null,"b":{"hands":{"1":7,"2":{"totals":"x"}}}}}']) {
      store.set(KEYS.reviews, junk);
      const games = loadGames();
      for (const g of Object.values(games)) expect(Object.keys(g.hands)).toEqual([]);
    }
  });
});
