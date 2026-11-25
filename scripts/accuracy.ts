/**
 * Calibration and validation of the move-accuracy analysis.
 *
 *   npm run accuracy                 # 40 hands per AI level
 *   npm run accuracy -- --hands 100
 *
 * It answers four questions:
 *   1. Does the score rank players sensibly? (Facile < Medio < Difficile)
 *   2. Does the analysis use only what the player could know? Each decision is
 *      analysed three times - from the full game state, from the player's own
 *      masked view, and from a state where the other three hands have been
 *      shuffled among themselves - and the three results must be identical.
 *   3. How repeatable is it? The same hands are analysed again with different
 *      random deals and the scores compared.
 *   4. How long does one decision take?
 *
 * Every hand is analysed with a running match score, as in the app, cycling
 * through an opening hand, mid-match scores and scores at which the hand
 * decides the match.
 */
import { fork } from 'node:child_process';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chooseMove, type AiLevel } from '../src/ai/index';
import { analyseMove, analysePosition, summarise } from '../src/analysis/analyze';
import { candidatesFor, explainedLimit } from '../src/analysis/facts';
import { moveIndices, positionBefore } from '../src/analysis/positions';
import { creditedLoss, handScore } from '../src/analysis/scoring';
import { MOVE_CLASSES, type MoveClass, type MoveReview } from '../src/analysis/types';
import {
  DEFAULT_RULES,
  createMatch,
  isDenari,
  makeRng,
  playMove,
  shuffle,
  viewFor,
  type HandState,
  type MatchState,
  type Rules,
  type Seat,
} from '../src/engine/index';

const LEVELS: AiLevel[] = ['facile', 'medio', 'difficile'];

interface Tally {
  level: AiLevel;
  hands: number;
  scores: number[];
  losses: number[];
  ses: number[];
  classes: Record<MoveClass, number>;
  ms: number[];
  leaks: string[];
  repeatMove: number[];
  repeatHand: number[];
  /** Per hand, per scored decision: [credited loss before the cap, stake, the most its concrete reasons can justify charging]. */
  raw: [number, number, number | null][][];
  /** Per starting score (index into STARTS): scored decisions, and those the match guard applied to. */
  decisionsAt: number[];
  guardedAt: number[];
  /** Decisions measured as costing at least 0.3 points: how many came with a concrete reason / were capped. */
  costly: number;
  explained: number;
}

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
}

const HANDS = arg('hands', 40);
/** Match scores before the hand (for a target of 21), cycled over the simulated hands. */
const STARTS: [number, number][] = [
  [0, 0],
  [9, 7],
  [15, 14],
  [19, 12],
  [12, 19],
];
const JOBS = Math.max(1, arg('jobs', Math.min(cpus().length, 8)));

/** The same position with the cards of the three other players dealt differently. */
function shuffledOthers(hand: HandState, seat: number, seed: number): HandState {
  const others = [0, 1, 2, 3].filter((s) => s !== seat);
  const pool = shuffle(others.flatMap((s) => hand.hands[s]!), makeRng(seed));
  const hands = hand.hands.map((h) => h.slice());
  let p = 0;
  for (const s of others) hands[s] = pool.slice(p, (p += hand.hands[s]!.length));
  return { ...hand, hands };
}

function playAndAnalyse(level: AiLevel, game: number, tally: Tally): void {
  const rules: Rules = {
    ...DEFAULT_RULES,
    variant: game % 2 ? 'classico' : 'scientifico',
    reBello: game % 4 === 3,
    napola: game % 8 === 5,
  };
  const seat = (game % 4) as Seat;
  const start = STARTS[game % STARTS.length]!;
  const scores: [number, number] = [Math.round((start[0] * rules.target) / 21), Math.round((start[1] * rules.target) / 21)];
  let m: MatchState = createMatch(rules, 50_000 + game * 13);
  const before: MatchState[] = [];
  let step = 0;
  while (!m.hand.done) {
    const s = m.hand.turn;
    // The analysed seat plays at `level`; the other three play Medio.
    const move = chooseMove(viewFor(m, [s]), s, { level: s === seat ? level : 'medio', seed: game * 1000 + step, samples: 60 });
    before.push(m);
    m = playMove(m, move);
    step++;
  }

  const reviews: MoveReview[] = [];
  const again: MoveReview[] = [];
  const limits: number[] = [];
  for (const index of moveIndices(m.hand, seat)) {
    const t0 = performance.now();
    const fromEnd = analyseMove(m.hand, rules, index, undefined, scores)!;
    const ms = performance.now() - t0;
    reviews.push(fromEnd);
    if (fromEnd.cls !== 'forced') {
      tally.ms.push(ms);
      tally.losses.push(fromEnd.loss);
      tally.ses.push(fromEnd.se);
    }
    tally.classes[fromEnd.cls]++;
    if (fromEnd.loss - fromEnd.se >= 0.3) {
      tally.costly++;
      if (fromEnd.reasons.some((r) => r.code !== 'category' && r.code !== 'longTerm')) tally.explained++;
    }

    // 2. no hidden information: three different sources, one answer
    const then = before[index]!;
    const fromView = analyseMove(viewFor(playMove(then, { card: fromEnd.options[fromEnd.played]!.move.card, capture: fromEnd.options[fromEnd.played]!.move.capture }), [seat]).hand, rules, index, undefined, scores);
    const pos = positionBefore(m.hand, rules, seat, index)!;
    if (fromEnd.cls !== 'forced') {
      // What the concrete reasons can justify charging (as analysePosition works it out), for the what-if table.
      const decided = {
        carte: Math.max(pos.captured[0].length, pos.captured[1].length) >= 21,
        denari: Math.max(pos.captured[0].filter(isDenari).length, pos.captured[1].filter(isDenari).length) >= 6,
      };
      limits[index] = fromEnd.matchSafe ? -1 : explainedLimit(candidatesFor(fromEnd.options[fromEnd.played]!, fromEnd.options[0]!, decided));
      tally.decisionsAt[game % STARTS.length]!++;
      if (fromEnd.matchSafe) tally.guardedAt[game % STARTS.length]!++;
    }
    // The rebuilt position with the REAL cards of the other three put back in, and with those cards shuffled.
    const real: HandState = { ...pos, hands: pos.hands.map((h, i) => (i === seat ? h : then.hand.hands[i]!.slice())) };
    const fromShuffled = analysePosition(shuffledOthers(real, seat, game * 7 + index), rules, m.hand.history[index]!, index, undefined, scores);
    const fromReal = analysePosition(real, rules, m.hand.history[index]!, index, undefined, scores);
    const key = JSON.stringify(fromEnd);
    if (JSON.stringify(fromView) !== key) tally.leaks.push(`game ${game} move ${index}: own view differs from finished hand`);
    if (JSON.stringify(fromShuffled) !== key) tally.leaks.push(`game ${game} move ${index}: result changes when hidden cards are shuffled`);
    if (JSON.stringify(fromReal) !== key) tally.leaks.push(`game ${game} move ${index}: result changes when given the real hidden cards`);
    if (JSON.stringify(analysePosition(pos, rules, m.hand.history[index]!, index, undefined, scores)) !== key) tally.leaks.push(`game ${game} move ${index}: not deterministic`);

    // 3. repeatability: same decision, different sampled deals (perturb the seed through the history order)
    if (fromEnd.cls !== 'forced') {
      const other = analysePosition({ ...pos, table: [...pos.table].reverse(), hands: pos.hands.map((h, i) => (i === seat ? [...h].reverse() : h)) }, rules, m.hand.history[index]!, index, undefined, scores);
      again.push(other);
      tally.repeatMove.push(Math.abs(other.accuracy - fromEnd.accuracy));
    } else again.push(fromEnd);
  }
  tally.raw.push(
    reviews
      .filter((r) => r.cls !== 'forced')
      // a decision the match guard applied to keeps the charge it got
      .map((r) => (limits[r.index] === -1 ? [r.credited, r.stake, Infinity] : [creditedLoss(r.loss, r.se), r.stake, limits[r.index] ?? 0])),
  );
  const review = summarise(1, seat, reviews, reviews.length, true);
  if (review.score !== null) {
    tally.scores.push(review.score);
    const s2 = handScore(again);
    if (s2 !== null) tally.repeatHand.push(Math.abs(s2 - review.score));
  }
  tally.hands++;
}

const newTally = (level: AiLevel): Tally => ({
  level,
  hands: 0,
  scores: [],
  losses: [],
  ses: [],
  classes: Object.fromEntries(MOVE_CLASSES.map((c) => [c, 0])) as Record<MoveClass, number>,
  ms: [],
  leaks: [],
  repeatMove: [],
  repeatHand: [],
  raw: [],
  decisionsAt: STARTS.map(() => 0),
  guardedAt: STARTS.map(() => 0),
  costly: 0,
  explained: 0,
});

if (process.argv.includes('--shard')) {
  const shard = arg('shard', 0);
  for (const level of LEVELS) {
    const tally = newTally(level);
    for (let g = shard; g < HANDS; g += JOBS) playAndAnalyse(level, g, tally);
    process.send?.(tally);
  }
  process.exit(0);
} else {
  const started = Date.now();
  const totals = new Map(LEVELS.map((l) => [l, newTally(l)]));
  console.log(`Analysing ${HANDS} hands per level (the analysed seat plays at that level, the other three play Medio), ${JOBS} processes...\n`);
  const self = fileURLToPath(import.meta.url);
  await Promise.all(
    Array.from({ length: JOBS }, (_, shard) =>
      new Promise<void>((resolve, reject) => {
        const child = fork(self, ['--shard', String(shard), '--hands', String(HANDS), '--jobs', String(JOBS)], { execArgv: process.execArgv });
        child.on('message', (t: Tally) => {
          const sum = totals.get(t.level)!;
          sum.hands += t.hands;
          for (const k of ['scores', 'losses', 'ses', 'ms', 'leaks', 'repeatMove', 'repeatHand', 'raw'] as const) (sum[k] as unknown[]).push(...t[k]);
          for (const c of MOVE_CLASSES) sum.classes[c] += t.classes[c];
          sum.costly += t.costly;
          STARTS.forEach((_, i) => {
            sum.decisionsAt[i]! += t.decisionsAt[i]!;
            sum.guardedAt[i]! += t.guardedAt[i]!;
          });
          sum.explained += t.explained;
        });
        child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`shard ${shard} exited with ${code}`))));
        child.on('error', reject);
      }),
    ),
  );

  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const q = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))] ?? 0;
  console.log('level      hands  score/10 (mean, 10th-90th pct)  brill  best  good  inacc  mist  blund   mean loss');
  for (const level of LEVELS) {
    const t = totals.get(level)!;
    const real = MOVE_CLASSES.filter((c) => c !== 'forced').reduce((n, c) => n + t.classes[c], 0);
    const pc = (c: MoveClass) => `${Math.round((100 * t.classes[c]) / Math.max(1, real))}%`.padStart(5);
    console.log(
      `${level.padEnd(10)} ${String(t.hands).padStart(5)}   ${mean(t.scores).toFixed(2)}  (${q(t.scores, 0.1).toFixed(1)} - ${q(t.scores, 0.9).toFixed(1)})`.padEnd(46) +
        `${pc('brilliant')}${pc('best')}${pc('good')}${pc('inaccuracy')}  ${pc('mistake')} ${pc('blunder')}     ${mean(t.losses).toFixed(3)}`,
    );
  }
  const all = [...totals.values()];
  const ms = all.flatMap((t) => t.ms);
  const leaks = all.flatMap((t) => t.leaks);
  console.log(`\nWhat-if scoring schemes (mean hand score per level, and the spread between levels):`);
  const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
  const gauss = (sigma: number) => (l: number) => Math.exp(-((l / sigma) ** 2));
  const schemes: [string, (loss: number) => number, number][] = [
    ['exp(-(loss/0.44)^2), unexplained losses limited to 0.3', gauss(0.44), 0.3],
    ['exp(-(loss/0.44)^2), limited to 0.4', gauss(0.44), 0.4],
    ['exp(-(loss/0.40)^2), limited to 0.4', gauss(0.4), 0.4],
    ['exp(-(loss/0.35)^2), limited to 0.4', gauss(0.35), 0.4],
    ['exp(-(loss/0.40)^2), no limit', gauss(0.4), Infinity],
    ['exp(-loss/0.3), limited to 0.3', (l) => Math.exp(-l / 0.3), 0.3],
  ];
  for (const [name, acc, cap] of schemes) {
    const per = LEVELS.map((l) => {
      const hs = totals
        .get(l)!
        .raw.filter((h) => h.length > 0)
        .map((h) => {
          let sum = 0;
          let weight = 0;
          for (const [uncapped, stake, limit] of h) {
            // null: JSON turned Infinity into null on its way from the worker process
            const credited = limit === null ? uncapped : Math.min(uncapped, Math.max(cap, limit));
            const wt = clamp(Math.max(stake, credited), 0.2, 1.5);
            sum += wt * acc(credited);
            weight += wt;
          }
          return (10 * sum) / weight;
        });
      return mean(hs);
    });
    console.log(`  ${name.padEnd(54)} ${LEVELS.map((l, i) => `${l} ${per[i]!.toFixed(2)}`).join('   ')}   spread ${(per[2]! - per[0]!).toFixed(2)}`);
  }

  const costly = all.reduce((n, t) => n + t.costly, 0);
  const explained = all.reduce((n, t) => n + t.explained, 0);
  console.log(`\nExplanations: of ${costly} decisions measured as costing at least 0.3 points, ${explained} (${Math.round((100 * explained) / Math.max(1, costly))}%) came with a concrete reason; the rest are limited to an inaccuracy.`);
  const at = STARTS.map((s, i) => `${s[0]}-${s[1]}: ${all.reduce((n, t) => n + t.guardedAt[i]!, 0)}/${all.reduce((n, t) => n + t.decisionsAt[i]!, 0)}`);
  console.log(`Match guard (decisions charged at most 'good' because the hand decides the match and the move does not lower the chance of winning it), by score before the hand: ${at.join(', ')}`);
  console.log(`Precision: standard error of the loss - mean ${mean(all.flatMap((t) => t.ses)).toFixed(3)}, 90th pct ${q(all.flatMap((t) => t.ses), 0.9).toFixed(3)} points`);
  console.log(`Repeatability (same decisions, different sampled deals): move accuracy changes by ${mean(all.flatMap((t) => t.repeatMove)).toFixed(1)} points of 100 on average (90th pct ${q(all.flatMap((t) => t.repeatMove), 0.9).toFixed(1)}); hand score changes by ${mean(all.flatMap((t) => t.repeatHand)).toFixed(2)} of 10 on average (90th pct ${q(all.flatMap((t) => t.repeatHand), 0.9).toFixed(1)})`);
  console.log(`Time per decision: mean ${mean(ms).toFixed(0)} ms, 90th pct ${q(ms, 0.9).toFixed(0)} ms, max ${Math.max(...ms).toFixed(0)} ms (${ms.length} decisions)`);
  console.log(`Hidden-information check: ${leaks.length === 0 ? 'PASS' : 'FAIL'} - every decision analysed from the full state, the player's own view, shuffled hidden hands and the finished hand gave ${leaks.length === 0 ? 'identical' : 'DIFFERENT'} results`);
  for (const l of leaks.slice(0, 8)) console.error('  ' + l);
  console.log(`Total time: ${((Date.now() - started) / 1000).toFixed(1)} s`);
  const order = LEVELS.map((l) => mean(totals.get(l)!.scores));
  const ranked = order[0]! < order[1]! && order[1]! < order[2]!;
  console.log(`\n${ranked && leaks.length === 0 ? 'OK' : 'FAILED'}: ${ranked ? 'scores rank Facile < Medio < Difficile' : 'scores do NOT rank the levels'}; ${leaks.length} hidden-information problems.`);
  if (!ranked || leaks.length > 0) process.exit(1);
}
