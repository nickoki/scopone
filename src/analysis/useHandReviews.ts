/**
 * Keeps the move analyses of the game on screen.
 *
 * It watches the state shown on this device and, whenever one of the people
 * playing here has made a move whose position can be rebuilt (their cards are
 * visible, or the hand is over), queues it for the analysis worker. Results
 * are kept per hand so earlier hands can be reopened, and are saved with a key
 * identifying the game so they survive a reload.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MatchState, Rules, Seat } from '../engine';
import { KEYS, loadJson, saveJson } from '../state/storage';
import { summarise } from './analyze';
import { requestAnalysis } from './client';
import { decisionAt, moveIndices, type Decision } from './positions';
import type { HandReview, MoveReview } from './types';

interface HandRecord {
  /** Analysed moves, any seat. */
  moves: MoveReview[];
  /** Moves each seat has made in the hand so far. */
  totals: number[];
  done: boolean;
  /** The moves the person made themselves: history index and the card they tapped (see `strict`). */
  mine: { index: number; card: number }[];
  /** Seats of the moves whose analysis failed; they are left out rather than waited for. */
  failedSeats: number[];
  failed: number[];
}

interface Stored {
  /** Version of the analysis that produced these results. */
  v: number;
  gameKey: string;
  hands: Record<number, HandRecord>;
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
const KEEP_HANDS = 12;
/** Bump when the scoring changes, so stored verdicts are never mixed with new ones. */
const ANALYSIS_VERSION = 4;

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

function loadStored(gameKey: string): Record<number, HandRecord> {
  const s = loadJson<Stored>(KEYS.reviews);
  if (!s || s.v !== ANALYSIS_VERSION || s.gameKey !== gameKey || !s.hands || typeof s.hands !== 'object') return {};
  const out: Record<number, HandRecord> = {};
  for (const [n, rec] of Object.entries(s.hands)) {
    if (rec && Array.isArray(rec.moves) && Array.isArray(rec.totals)) out[Number(n)] = { ...emptyRecord(), ...rec, failed: [], failedSeats: [] };
  }
  return out;
}

/** The match score before the hand being shown (public): once a hand is over its points are already in the total. */
function scoresBefore(view: MatchState): [number, number] {
  if (!view.hand.done) return [view.scores[0], view.scores[1]];
  const last = view.handScores[view.handScores.length - 1];
  return last ? [view.scores[0] - last.total[0], view.scores[1] - last.total[1]] : [view.scores[0], view.scores[1]];
}

/**
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
  const [hands, setHands] = useState<Record<number, HandRecord>>(() => loadStored(gameKey));
  const keyRef = useRef(gameKey);
  /** Jobs waiting for the worker, oldest first, and the keys of every job queued or running. */
  const queue = useRef<Job[]>([]);
  const known = useRef(new Set<string>());
  const running = useRef(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const pump = useCallback(() => {
    if (running.current || pausedRef.current) return;
    const job = queue.current.shift();
    if (!job) return;
    running.current = true;
    const { hand: hn, seat, decision } = job;
    requestAnalysis(decision, job.rules, job.scores)
      .then((review) => {
        if (keyRef.current !== job.gameKey) return;
        setHands((prev) => {
          const cur = prev[hn] ?? emptyRecord();
          if (cur.moves.some((m) => m.index === review.index)) return prev;
          return { ...prev, [hn]: { ...cur, moves: [...cur.moves, review] } };
        });
      })
      .catch(() => {
        // Leave this decision out instead of waiting for it forever.
        if (keyRef.current !== job.gameKey) return;
        setHands((prev) => {
          const cur = prev[hn] ?? emptyRecord();
          if (cur.failed.includes(decision.index)) return prev;
          return { ...prev, [hn]: { ...cur, failed: [...cur.failed, decision.index], failedSeats: [...cur.failedSeats, seat] } };
        });
      })
      .finally(() => {
        running.current = false;
        pump();
      });
  }, []);

  // A different game: start from whatever was saved for it.
  useEffect(() => {
    if (keyRef.current === gameKey) return;
    keyRef.current = gameKey;
    queue.current = [];
    known.current = new Set();
    setHands(loadStored(gameKey));
  }, [gameKey]);

  const seatsKey = seats.join(',');
  const currentHand = view.handNumber;
  useEffect(() => {
    if (!enabled || seats.length === 0) return;
    const hand = view.hand;
    const hn = view.handNumber;
    const record = hands[hn];
    const have = new Set([...(record?.moves ?? []).map((m) => m.index), ...(record?.failed ?? [])]);

    // Keep the bookkeeping (how many moves each seat has made, is the hand over) current.
    const totals = [0, 1, 2, 3].map((s) => moveIndices(hand, s).length);
    if (!record || record.done !== hand.done || record.totals.join() !== totals.join()) {
      setHands((prev) => ({ ...prev, [hn]: { ...(prev[hn] ?? emptyRecord()), totals, done: hand.done } }));
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
  }, [enabled, gameKey, view, seatsKey, hands, pump]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resume when the computer has finished thinking.
  useEffect(() => {
    if (!paused) pump();
  }, [paused, pump]);

  // Persist (bounded) so a reload keeps the reviews of this game.
  useEffect(() => {
    if (!enabled) return;
    const numbers = Object.keys(hands).map(Number).sort((a, b) => a - b);
    const kept: Record<number, HandRecord> = {};
    for (const n of numbers.slice(-KEEP_HANDS)) kept[n] = hands[n]!;
    const stored: Stored = { v: ANALYSIS_VERSION, gameKey, hands: kept };
    saveJson(KEYS.reviews, stored);
  }, [enabled, gameKey, hands]);

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
          return own ? m : { ...m, cls: 'forced', weight: 0, accuracy: 100, credited: 0, reasons: [], auto: true, even: false, matchSafe: false };
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

  const notePlayed = useCallback((handNumber: number, index: number, card: number) => {
    setHands((prev) => {
      const cur = prev[handNumber] ?? emptyRecord();
      const mine = [...cur.mine.filter((x) => x.index !== index), { index, card }];
      return { ...prev, [handNumber]: { ...cur, mine } };
    });
  }, []);

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
