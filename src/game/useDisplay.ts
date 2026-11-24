/**
 * Sequences what is shown on screen. The real game state can jump ahead
 * instantly (an AI or a remote player moved); this hook replays each change
 * with a short animation, one at a time:
 *
 *   capture:  the played card lands on the cards it takes  ->  they slide to the pile
 *   lay-down: the card slides to the table
 *   new hand: the deal
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { playSound } from '../audio/sound';
import type { MatchState } from '../engine';
import type { CaptureAnim } from './types';

export interface Display {
  shown: MatchState | null;
  anim: CaptureAnim | null;
  busy: boolean;
  /** Seat that just scored a scopa (drives the banner), with a changing key. */
  scopa: { seat: number; key: number } | null;
}

export interface DisplayTimings {
  show: number;
  collect: number;
  lay: number;
  deal: number;
  handEnd: number;
}

export const TIMINGS: Record<'normal' | 'fast', DisplayTimings> = {
  normal: { show: 720, collect: 420, lay: 420, deal: 1900, handEnd: 700 },
  fast: { show: 420, collect: 300, lay: 280, deal: 1750, handEnd: 450 },
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function useDisplay(latest: MatchState | null, timings: DisplayTimings): Display {
  const [shown, setShown] = useState<MatchState | null>(null);
  const [anim, setAnim] = useState<CaptureAnim | null>(null);
  const [busy, setBusy] = useState(false);
  const [scopa, setScopa] = useState<{ seat: number; key: number } | null>(null);

  const shownRef = useRef<MatchState | null>(null);
  const queue = useRef<MatchState[]>([]);
  const running = useRef(false);
  const alive = useRef(true);
  const timingsRef = useRef(timings);
  timingsRef.current = timings;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const pump = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    while (queue.current.length > 0 && alive.current) {
      // Far behind (e.g. after reconnecting)? Skip straight to the newest state.
      if (queue.current.length > 3) queue.current.splice(0, queue.current.length - 1);
      const next = queue.current.shift()!;
      const cur = shownRef.current;
      const T = timingsRef.current;
      const show = (s: MatchState) => {
        shownRef.current = s;
        setShown(s);
      };

      const sameHand = cur !== null && cur.handNumber === next.handNumber;
      const grew = sameHand ? next.hand.history.length - cur.hand.history.length : 0;

      if (!cur || !sameHand) {
        show(next);
        if (next.phase === 'playing' && next.hand.history.length === 0) {
          playSound('deal');
          await wait(T.deal);
        }
      } else if (grew === 1) {
        const move = next.hand.history[next.hand.history.length - 1]!;
        if (move.captured.length > 0) {
          setAnim({ move });
          playSound('play');
          await wait(T.show);
          if (!alive.current) break;
          setAnim(null);
          show(next);
          if (move.scopa) {
            setScopa({ seat: move.seat, key: Date.now() });
            playSound('scopa');
          } else {
            playSound('capture');
          }
          await wait(T.collect + (move.scopa ? 500 : 0));
        } else {
          show(next);
          playSound('play');
          await wait(T.lay);
        }
        if (next.hand.done) await wait(T.handEnd);
      } else {
        // Same position re-masked (pass-and-play reveal), or several moves at once.
        show(next);
      }
    }
    running.current = false;
    if (alive.current) setBusy(false);
  }, []);

  useEffect(() => {
    if (!latest) {
      queue.current = [];
      shownRef.current = null;
      setShown(null);
      return;
    }
    queue.current.push(latest);
    void pump();
  }, [latest, pump]);

  // Busy from the moment a new state arrives (not one render later) until it is fully shown.
  const pending = latest !== null && latest !== shown;
  return { shown, anim, busy: busy || pending, scopa };
}
