/**
 * Keeps the move analyses of the game on screen.
 *
 * It watches the state shown on this device and, whenever one of the people
 * playing here has made a move whose position can be rebuilt (their cards are
 * visible, or the hand is over), queues it for the analysis worker. Results
 * are kept per hand so earlier hands can be reopened, and are saved under a
 * key identifying the game so they survive a reload.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MatchState, Rules, Seat } from '../engine';
import { KEYS, loadJson, saveText } from '../state/storage';
import { summarise } from './analyze';
import { requestAnalysis } from './client';
import { decisionAt, moveIndices, type Decision } from './positions';
import type { HandReview, MoveReview } from './types';

export interface HandRecord {
  /** Analysed moves, any seat. */
  moves: MoveReview[];
  /** Moves each seat has made in the hand so far. */
  totals: number[];
  done: boolean;
  /** The moves the person made themselves: history index and the card they tapped (see `strict`). */
  mine: { index: number; card: number }[];
  /** Seats of the moves whose analysis failed; they are left out rather than waited for. Not saved: they are retried after a reload. */
  failedSeats: number[];
  failed: number[];
}

type Hands = Record<number, HandRecord>;

export interface StoredGame {
  savedAt: number;
  hands: Record<string, Pick<HandRecord, 'moves' | 'totals' | 'done' | 'mine'>>;
}

interface Stored {
  /** Version of the analysis that produced the verdicts. */
  v: number;
  /** One entry per game that can still be reopened (a local game, a hosted room, a joined room). */
  games: Record<string, StoredGame>;
}

interface Job {
  key: string;
  gameKey: string;
  hand: number;
  seat: number;
  decision: Decision;
  rules: Rules;
  scores: [number, number];
}

/** Older hands are dropped beyond this, to bound what is kept in localStorage. */
export const KEEP_HANDS = 12;
/** Games kept side by side: the saved local game, a hosted room and a joined room can all be reopened. */
export const KEEP_GAMES = 3;
/** Upper bound for everything stored here, in characters: storage is shared with the saved game itself. */
export const MAX_CHARS = 600_000;
/** Bump when the scoring changes, so stored verdicts are never mixed with new ones. */
export const ANALYSIS_VERSION = 5;

export interface HandReviews {
  /** False when the feature is switched off or locked. */
  enabled: boolean;
  /** The review of one seat's play in one hand (null if nothing is known about it). */
  get: (handNumber: number, seat: Seat) => HandReview | null;
  /** Hand numbers that have at least one analysed move, ascending. */
  hands: number[];
  /** Call just before the person on this device plays a card. */
  notePlayed: (handNumber: number, index: number, card: number) => void;
}

const emptyRecord = (): HandRecord => ({ moves: [], totals: [0, 0, 0, 0], done: false, mine: [], failed: [], failedSeats: [] });

/** Everything stored, tolerating anything that is not in the expected shape. (Exported for the tests.) */
export function loadGames(): Record<string, StoredGame> {
  const s = loadJson<Stored>(KEYS.reviews);
  const out: Record<string, StoredGame> = {};
  if (!s || typeof s !== 'object' || !s.games || typeof s.games !== 'object') return out;
  // Verdicts of another version of the analysis are dropped (the moves are analysed again); the record of
  // which cards the person played themselves is kept, since it cannot be worked out again.
  const sameVersion = s.v === ANALYSIS_VERSION;
  for (const [key, game] of Object.entries(s.games)) {
    if (!game || typeof game !== 'object' || !game.hands || typeof game.hands !== 'object') continue;
    const hands: StoredGame['hands'] = {};
    for (const [n, rec] of Object.entries(game.hands)) {
      if (!rec || !Array.isArray(rec.totals)) continue;
      hands[n] = {
        moves: sameVersion && Array.isArray(rec.moves) ? rec.moves : [],
        totals: rec.totals,
        done: rec.done === true,
        mine: Array.isArray(rec.mine) ? rec.mine : [],
      };
    }
    out[key] = { savedAt: typeof game.savedAt === 'number' ? game.savedAt : 0, hands };
  }
  return out;
}

export function handsOf(game: StoredGame | undefined): Hands {
  const out: Hands = {};
  if (game) for (const [n, rec] of Object.entries(game.hands)) out[Number(n)] = { ...emptyRecord(), ...rec };
  return out;
}

/**
 * Save this game's reviews next to those of the other games that can still be
 * reopened (`others`), within the limits above: the least recently used games
 * go first, then this game's oldest hands.
 */
export function saveGames(gameKey: string, hands: Hands, others: Record<string, StoredGame>): void {
  const numbers = Object.keys(hands).map(Number).sort((a, b) => a - b).slice(-KEEP_HANDS);
  const own: StoredGame = { savedAt: Date.now(), hands: {} };
  let worthKeeping = false;
  for (const n of numbers) {
    const { moves, totals, done, mine } = hands[n]!;
    if (moves.length > 0 || mine.length > 0) worthKeeping = true;
    own.hands[n] = { moves, totals, done, mine };
  }
  if (!worthKeeping) return; // nothing to remember yet: leave what is stored for the other games alone
  let rest = Object.entries(others)
    .filter(([key]) => key !== gameKey)
    .sort((a, b) => b[1].savedAt - a[1].savedAt)
    .slice(0, KEEP_GAMES - 1);
  const pack = () => JSON.stringify({ v: ANALYSIS_VERSION, games: { ...Object.fromEntries(rest), [gameKey]: own } } satisfies Stored);
  let text = pack();
  while (text.length > MAX_CHARS && rest.length > 0) {
    rest = rest.slice(0, -1);
    text = pack();
  }
  while (text.length > MAX_CHARS && Object.keys(own.hands).length > 1) {
    delete own.hands[Math.min(...Object.keys(own.hands).map(Number))];
    text = pack();
  }
  if (text.length <= MAX_CHARS) saveText(KEYS.reviews, text);
}

/** The match score before the hand being shown (public): once a hand is over its points are already in the total. */
function scoresBefore(view: MatchState): [number, number] {
  if (!view.hand.done) return [view.scores[0], view.scores[1]];
  const last = view.handScores[view.handScores.length - 1];
  return last ? [view.scores[0] - last.total[0], view.scores[1] - last.total[1]] : [view.scores[0], view.scores[1]];
}

/**
 * `gameKey` must name the game that `view` belongs to (the controllers see to
 * that); as a second line of defence, everything here is keyed and nothing is
 * read, queued or saved in the one render where the two could disagree.
 *
 * `strict`: only moves reported through `notePlayed` count as the person's
 * own. Used online, where the computer covers a seat while its player is
 * away — those moves must not be held against the player.
 *
 * `paused`: a computer player is thinking. Its strength depends on how much
 * it can compute in a fixed time, so no new analysis is started meanwhile
 * (one already running is allowed to finish).
 */
export function useHandReviews(
  gameKey: string,
  view: MatchState,
  seats: readonly Seat[],
  enabled: boolean,
  strict: boolean,
  paused: boolean,
): HandReviews {
  /** What is stored for the other games; read once per game shown. */
  const others = useRef<Record<string, StoredGame>>({});
  const load = (key: string): { key: string; hands: Hands } => {
    const games = loadGames();
    others.current = games;
    return { key, hands: handsOf(games[key]) };
  };
  /** The reviews, together with the game they belong to. */
  const [state, setState] = useState(() => load(gameKey));
  /** Jobs waiting for the worker, oldest first, and the keys of every job queued or running. */
  const queue = useRef<Job[]>([]);
  const known = useRef(new Set<string>());
  const running = useRef(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const keyRef = useRef(gameKey);

  /** Change the reviews of game `key` - unless another game is on screen by now. */
  const update = useCallback((key: string, change: (hands: Hands) => Hands) => {
    setState((s) => {
      if (s.key !== key) return s;
      const hands = change(s.hands);
      return hands === s.hands ? s : { key, hands };
    });
  }, []);

  const pump = useCallback(() => {
    if (running.current || pausedRef.current) return;
    const job = queue.current.shift();
    if (!job) return;
    running.current = true;
    const { hand: hn, seat, decision } = job;
    requestAnalysis(decision, job.rules, job.scores)
      .then((review) => {
        update(job.gameKey, (prev) => {
          const cur = prev[hn] ?? emptyRecord();
          if (cur.moves.some((m) => m.index === review.index)) return prev;
          return { ...prev, [hn]: { ...cur, moves: [...cur.moves, review] } };
        });
      })
      .catch(() => {
        // Leave this decision out instead of waiting for it forever.
        update(job.gameKey, (prev) => {
          const cur = prev[hn] ?? emptyRecord();
          if (cur.failed.includes(decision.index)) return prev;
          return { ...prev, [hn]: { ...cur, failed: [...cur.failed, decision.index], failedSeats: [...cur.failedSeats, seat] } };
        });
      })
      .finally(() => {
        running.current = false;
        pump();
      });
  }, [update]);

  // A different game: drop what was waiting and start from whatever was saved for it.
  useEffect(() => {
    if (keyRef.current === gameKey) return;
    keyRef.current = gameKey;
    queue.current = [];
    known.current = new Set();
    setState(load(gameKey));
  }, [gameKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = state.key === gameKey;
  const hands = current ? state.hands : NO_HANDS;
  const seatsKey = seats.join(',');
  const currentHand = view.handNumber;
  useEffect(() => {
    if (!enabled || seats.length === 0 || !current) return;
    const hand = view.hand;
    const hn = view.handNumber;
    const record = hands[hn];
    const have = new Set([...(record?.moves ?? []).map((m) => m.index), ...(record?.failed ?? [])]);

    // Keep the bookkeeping (how many moves each seat has made, is the hand over) current.
    const totals = [0, 1, 2, 3].map((s) => moveIndices(hand, s).length);
    if (!record || record.done !== hand.done || record.totals.join() !== totals.join()) {
      update(gameKey, (prev) => ({ ...prev, [hn]: { ...(prev[hn] ?? emptyRecord()), totals, done: hand.done } }));
    }

    const scores = scoresBefore(view);
    for (const seat of seats) {
      for (const index of moveIndices(hand, seat)) {
        const key = `${gameKey}|${hn}|${index}`;
        if (have.has(index) || known.current.has(key)) continue;
        // Only this player's own cards and the public record up to the move leave this function.
        const decision = decisionAt(hand, seat, index);
        if (!decision) continue; // that player's cards are not visible yet (shared phone): wait for the end of the hand
        known.current.add(key);
        queue.current.push({ key, gameKey, hand: hn, seat, decision, rules: view.rules, scores });
      }
    }
    pump();
  }, [enabled, gameKey, view, seatsKey, hands, current, pump, update]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resume when the computer has finished thinking.
  useEffect(() => {
    if (!paused) pump();
  }, [paused, pump]);

  // Persist (bounded) so a reload keeps the reviews of this game. Online, the record of which cards the
  // person played themselves is kept even while the feature is off: it cannot be worked out afterwards.
  useEffect(() => {
    if ((!enabled && !strict) || !current) return;
    saveGames(gameKey, hands, others.current);
  }, [enabled, strict, gameKey, hands, current]);

  const get = useCallback(
    (handNumber: number, seat: Seat): HandReview | null => {
      const rec = hands[handNumber];
      if (!rec) return null;
      const moves = rec.moves
        .filter((m) => m.seat === seat)
        .map((m): MoveReview => {
          // Online, the record at this index must be the very card the person tapped: if their move never
          // reached the host and the computer played instead, it is the computer's move, not theirs.
          const own = !strict || rec.mine.some((x) => x.index === m.index && x.card === m.options[m.played]?.move.card);
          return own ? m : { ...m, cls: 'forced', weight: 0, accuracy: 100, credited: 0, reasons: [], auto: true, even: false, matchSafe: false, capped: false };
        });
      const failed = rec.failedSeats.filter((s) => s === seat).length;
      // A hand before the current one is over even if this device never saw it end (e.g. it reconnected later):
      // whatever was analysed is then all there will be.
      const over = rec.done || handNumber < currentHand;
      const total = rec.done ? Math.max(0, (rec.totals[seat] ?? 0) - failed) : moves.length;
      return summarise(handNumber, seat, moves, total, over);
    },
    [hands, strict, currentHand],
  );

  const notePlayed = useCallback(
    (handNumber: number, index: number, card: number) => {
      update(keyRef.current, (prev) => {
        const cur = prev[handNumber] ?? emptyRecord();
        const mine = [...cur.mine.filter((x) => x.index !== index), { index, card }];
        return { ...prev, [handNumber]: { ...cur, mine } };
      });
    },
    [update],
  );

  return useMemo(
    () => ({
      enabled,
      get,
      notePlayed,
      hands: Object.keys(hands)
        .map(Number)
        .filter((n) => hands[n]!.moves.length > 0)
        .sort((a, b) => a - b),
    }),
    [enabled, get, notePlayed, hands],
  );
}

const NO_HANDS: Hands = {};
