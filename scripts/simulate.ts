/**
 * Headless AI-vs-AI simulator.
 *
 *   npm run simulate                 # 1,000 games per matchup, all matchups
 *   npm run simulate -- --games 200  # quicker run
 *   npm run simulate -- --samples 8  # Monte Carlo deals per Difficile decision
 *
 * Every move is checked by a rule verifier written independently from the
 * engine (brute-force capture enumeration, card conservation, turn order,
 * re-computed scores). Any violation or crash makes the script exit non-zero.
 */
import { fork } from 'node:child_process';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chooseMove, type AiLevel } from '../src/ai/index';
import {
  createMatch,
  legalMoves,
  nextHand,
  playMove,
  viewFor,
  type MatchState,
  type Move,
  type Rules,
} from '../src/engine/index';

// ---------------------------------------------------------------- verifier

const rank = (c: number) => (c % 10) + 1;
const suit = (c: number) => Math.floor(c / 10);
const PRIM = [0, 16, 12, 13, 14, 15, 18, 21, 10, 10, 10];

class Violation extends Error {}
function check(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Violation(msg);
}

/** Brute force over every subset of the table. */
function referenceCaptures(card: number, table: number[]): string[] {
  const r = rank(card);
  const singles = table.filter((t) => rank(t) === r);
  if (singles.length > 0) return singles.map((t) => String(t));
  const out: string[] = [];
  for (let mask = 1; mask < 1 << table.length; mask++) {
    let sum = 0;
    const set: number[] = [];
    for (let i = 0; i < table.length; i++) {
      if (mask & (1 << i)) {
        sum += rank(table[i]!);
        set.push(table[i]!);
      }
    }
    if (sum === r && set.length >= 2) out.push(set.sort((a, b) => a - b).join(','));
  }
  return out;
}

function verifyMove(before: MatchState, move: Move, after: MatchState): void {
  const hb = before.hand;
  const ha = after.hand;
  const seat = hb.turn;
  check(hb.hands[seat]!.includes(move.card), 'played a card that was not in hand');
  const ref = referenceCaptures(move.card, hb.table);
  const key = [...move.capture].sort((a, b) => a - b).join(',');
  if (ref.length === 0) check(move.capture.length === 0, 'captured with a card that cannot capture');
  else check(ref.includes(key), `illegal capture ${key} (legal: ${ref.join(' | ')})`);
  if (hb.table.some((t) => rank(t) === rank(move.card))) {
    check(move.capture.length === 1 && rank(move.capture[0]!) === rank(move.card), 'rank-match-first rule broken');
  }

  // Card conservation.
  const all = [...ha.hands.flat(), ...ha.table, ...ha.captured[0], ...ha.captured[1]];
  if (ha.done && ha.leftover?.team === null) all.push(...ha.leftover.cards);
  check(all.length === 40 && new Set(all).size === 40, 'cards are not conserved');
  check(ha.hands[seat]!.length === hb.hands[seat]!.length - 1, 'hand size did not drop by one');

  const team = seat % 2;
  const last = ha.hands.every((h) => h.length === 0);
  const cleared = move.capture.length > 0 && move.capture.length === hb.table.length;
  const expectScopa = cleared && !(last && before.rules.lastCardScopaExcluded);
  const rec = ha.history[ha.history.length - 1]!;
  check(rec.seat === seat && rec.card === move.card, 'history record mismatch');
  check(rec.scopa === expectScopa, 'scopa flag wrong');
  check(ha.scope[team]! === hb.scope[team]! + (expectScopa ? 1 : 0), 'scope count wrong');
  check(ha.scope[1 - team]! === hb.scope[1 - team]!, 'other team scope changed');

  if (move.capture.length > 0) {
    for (const c of [...move.capture, move.card]) check(ha.captured[team]!.includes(c), 'captured card not in the team pile');
    check(ha.lastCaptureTeam === team, 'last capturing team not updated');
  } else if (!last) {
    check(ha.table.includes(move.card), 'non-capturing card did not stay on the table');
    check(ha.table.length === hb.table.length + 1, 'table size wrong after lay-down');
  }

  if (!last) {
    check(ha.turn === (seat + 1) % 4, 'turn did not pass counter-clockwise');
    check(!ha.done, 'hand ended early');
  } else {
    check(ha.done, 'hand did not end');
    check(seat === hb.dealer, 'the dealer did not play the last card');
    check(ha.table.length === 0, 'table not cleared at hand end');
    verifyScore(before, after);
  }
}

function verifyScore(before: MatchState, after: MatchState): void {
  const rules = after.rules;
  const h = after.hand;
  const score = after.handScores[after.handScores.length - 1]!;
  const exp = [0, 0];
  const piles = h.captured;
  if (h.lastCaptureTeam !== null) check(piles[0].length + piles[1].length === 40, 'not all cards were captured');
  const more = (a: number, b: number) => {
    if (a > b) exp[0]!++;
    if (b > a) exp[1]!++;
  };
  more(piles[0].length, piles[1].length);
  more(piles[0].filter((c) => suit(c) === 0).length, piles[1].filter((c) => suit(c) === 0).length);
  exp[piles[0].includes(6) ? 0 : piles[1].includes(6) ? 1 : 0]! += piles[0].includes(6) || piles[1].includes(6) ? 1 : 0;
  const prim = (p: number[]) =>
    [0, 1, 2, 3].reduce((acc, s) => acc + Math.max(0, ...p.filter((c) => suit(c) === s).map((c) => PRIM[rank(c)]!)), 0);
  more(prim(piles[0]), prim(piles[1]));
  exp[0]! += h.scope[0];
  exp[1]! += h.scope[1];
  for (const t of [0, 1]) {
    if (rules.reBello && piles[t]!.includes(9)) exp[t]!++;
    if (rules.napola) {
      let run = 0;
      while (run < 10 && piles[t]!.includes(run)) run++;
      if (run >= 3) exp[t]! += run;
    }
  }
  check(score.total[0] === exp[0] && score.total[1] === exp[1], `hand score ${score.total} != expected ${exp}`);
  check(
    after.scores[0] === before.scores[0] + exp[0]! && after.scores[1] === before.scores[1] + exp[1]!,
    'running score wrong',
  );
  const [a, b] = after.scores;
  const over = a >= rules.target || b >= rules.target;
  const expectWinner = over && a !== b ? (a > b ? 0 : 1) : null;
  check(after.winner === expectWinner, 'winner wrong');
  check(after.phase === (expectWinner === null ? 'handEnd' : 'matchEnd'), 'phase wrong at hand end');
}

// ------------------------------------------------------------------ games

interface Matchup {
  name: string;
  /** Level of team A and team B. */
  a: AiLevel;
  b: AiLevel;
}

const MATCHUPS: Matchup[] = [
  { name: 'Facile vs Facile', a: 'facile', b: 'facile' },
  { name: 'Medio vs Medio', a: 'medio', b: 'medio' },
  { name: 'Difficile vs Difficile', a: 'difficile', b: 'difficile' },
  { name: 'Difficile vs Facile', a: 'difficile', b: 'facile' },
  { name: 'Difficile vs Medio', a: 'difficile', b: 'medio' },
  { name: 'Medio vs Facile', a: 'medio', b: 'facile' },
];

interface Tally {
  games: number;
  winsA: number;
  winsB: number;
  pointsA: number;
  pointsB: number;
  hands: number;
  moves: number;
  maxMs: Record<AiLevel, number>;
  violations: string[];
}

const newTally = (): Tally => ({
  games: 0,
  winsA: 0,
  winsB: 0,
  pointsA: 0,
  pointsB: 0,
  hands: 0,
  moves: 0,
  maxMs: { facile: 0, medio: 0, difficile: 0 },
  violations: [],
});

function rulesFor(game: number): Rules {
  // Cycle through every variant / toggle combination.
  return {
    variant: game % 2 === 0 ? 'scientifico' : 'classico',
    target: 11,
    lastCardScopaExcluded: ((game >> 1) & 1) === 0,
    reBello: ((game >> 2) & 1) === 1,
    napola: ((game >> 3) & 1) === 1,
  };
}

function playGame(mu: Matchup, game: number, samples: number, tally: Tally): void {
  const seed = (game + 1) * 7919 + mu.name.length * 104729;
  // Team A alternates between seats 0/2 and 1/3 so the deal order is not a factor.
  const teamOfA = game % 2;
  const levelOf = (seat: number): AiLevel => (seat % 2 === teamOfA ? mu.a : mu.b);
  let m = createMatch(rulesFor(game), seed);
  let step = 0;
  try {
    while (m.phase !== 'matchEnd') {
      if (m.phase === 'handEnd') {
        m = nextHand(m);
        tally.hands++;
        continue;
      }
      const seat = m.hand.turn;
      const level = levelOf(seat);
      const t0 = performance.now();
      const move = chooseMove(viewFor(m, [seat]), seat, { level, seed: seed + step * 31, samples });
      const dt = performance.now() - t0;
      if (dt > tally.maxMs[level]) tally.maxMs[level] = dt;
      check(legalMoves(m.hand).length > 0, 'no legal moves');
      const after = playMove(m, move);
      verifyMove(m, move, after);
      m = after;
      step++;
      tally.moves++;
      check(step < 20000, 'game did not terminate');
    }
    tally.hands++;
    tally.games++;
    const a = m.scores[teamOfA]!;
    const b = m.scores[1 - teamOfA]!;
    tally.pointsA += a;
    tally.pointsB += b;
    if (m.winner === teamOfA) tally.winsA++;
    else tally.winsB++;
  } catch (err) {
    tally.violations.push(`[${mu.name} game ${game} seed ${seed} step ${step}] ${err instanceof Error ? err.stack ?? err.message : err}`);
  }
}

// ------------------------------------------------------------------- main

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
}

const GAMES = arg('games', 1000);
const SAMPLES = arg('samples', 10);
const JOBS = Math.max(1, arg('jobs', Math.min(cpus().length, 8)));

interface ShardMsg {
  matchup: number;
  tally: Tally;
}

if (process.argv.includes('--shard')) {
  const shard = arg('shard', 0);
  for (let i = 0; i < MATCHUPS.length; i++) {
    const tally = newTally();
    for (let g = shard; g < GAMES; g += JOBS) playGame(MATCHUPS[i]!, g, SAMPLES, tally);
    process.send?.({ matchup: i, tally } satisfies ShardMsg);
  }
  process.exit(0);
} else {
  const started = Date.now();
  const totals = MATCHUPS.map(newTally);
  console.log(`Simulating ${GAMES} games per matchup (target 11, all rule variants), ${SAMPLES} sampled deals per Difficile move, ${JOBS} processes...\n`);
  const self = fileURLToPath(import.meta.url);
  await Promise.all(
    Array.from({ length: JOBS }, (_, shard) =>
      new Promise<void>((resolve, reject) => {
        const child = fork(self, ['--shard', String(shard), '--games', String(GAMES), '--samples', String(SAMPLES), '--jobs', String(JOBS)], {
          execArgv: process.execArgv,
        });
        child.on('message', (msg: ShardMsg) => {
          const t = totals[msg.matchup]!;
          const s = msg.tally;
          t.games += s.games;
          t.winsA += s.winsA;
          t.winsB += s.winsB;
          t.pointsA += s.pointsA;
          t.pointsB += s.pointsB;
          t.hands += s.hands;
          t.moves += s.moves;
          for (const k of Object.keys(t.maxMs) as AiLevel[]) t.maxMs[k] = Math.max(t.maxMs[k], s.maxMs[k]);
          t.violations.push(...s.violations);
        });
        child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`shard ${shard} exited with ${code}`))));
        child.on('error', reject);
      }),
    ),
  );

  let bad = 0;
  const pct = (n: number, d: number) => `${((100 * n) / Math.max(1, d)).toFixed(1)}%`;
  console.log('matchup (A vs B)            games   A wins   B wins   avg pts A/B   hands   moves    violations');
  MATCHUPS.forEach((mu, i) => {
    const t = totals[i]!;
    bad += t.violations.length + (t.games === GAMES ? 0 : 1);
    console.log(
      `${mu.name.padEnd(26)} ${String(t.games).padStart(6)}  ${pct(t.winsA, t.games).padStart(7)}  ${pct(t.winsB, t.games).padStart(7)}   ${(t.pointsA / Math.max(1, t.games)).toFixed(2).padStart(5)}/${(t.pointsB / Math.max(1, t.games)).toFixed(2).padEnd(5)}  ${String(t.hands).padStart(6)}  ${String(t.moves).padStart(7)}   ${t.violations.length}`,
    );
  });
  const maxMs = (lvl: AiLevel) => Math.max(...totals.map((t) => t.maxMs[lvl])).toFixed(1);
  console.log(`\nSlowest single decision: facile ${maxMs('facile')} ms, medio ${maxMs('medio')} ms, difficile ${maxMs('difficile')} ms (fixed ${SAMPLES} samples; the app uses a time budget instead).`);
  console.log(`Total time: ${((Date.now() - started) / 1000).toFixed(1)} s`);
  for (const t of totals) for (const v of t.violations.slice(0, 5)) console.error(v);
  if (bad > 0) {
    console.error(`\nFAILED: ${bad} problem(s) found.`);
    process.exit(1);
  }
  const dvf = totals[3]!;
  console.log(`\nOK: no rule violations or crashes. Difficile beat Facile in ${pct(dvf.winsA, dvf.games)} of ${dvf.games} games.`);
}
