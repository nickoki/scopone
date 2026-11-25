import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { viewFor, type MatchState, type Move, type Seat } from '../engine';
import { TIMINGS, useDisplay } from '../game/useDisplay';
import type { GameController, ReadyGate, SeatInfo } from '../game/types';
import type { Dict } from '../i18n';
import type { Speed } from '../state/settings';
import type { GuestSession } from './guest';
import type { HostSession } from './host';
import { seatInfos } from './protocol';

function awayNotice(seats: SeatInfo[], t: Dict): string | null {
  const away = seats.find((s) => s.away);
  return away ? t.online.playerAway(away.name) : null;
}

/** The start-of-hand gate as this device sees it (null once play is under way). */
function readyGate(latest: MatchState, flags: boolean[], seat: Seat | null, settled: boolean): ReadyGate | null {
  if (latest.phase !== 'playing' || latest.hand.history.length > 0 || flags.every(Boolean)) return null;
  return { seats: flags, canReady: settled && seat !== null && !flags[seat] };
}

/** Game controller for the device hosting the room. Null until a match exists. */
export function useHostController(session: HostSession, speed: Speed, t: Dict): GameController | null {
  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [tutorial, setTutorial] = useState(false);
  const { match, mySeat, lobby } = snap;
  const latest = useMemo(() => (match ? viewFor(match, mySeat === null ? [] : [mySeat]) : null), [match, mySeat]);
  const display = useDisplay(latest, TIMINGS[speed]);
  const play = useCallback((move: Move) => session.play(move), [session]);
  const next = useCallback(() => session.nextHand(), [session]);
  const readyUp = useCallback(() => session.readyUp(), [session]);
  const noop = useCallback(() => undefined, []);
  // The host's speed paces the computer's moves for the whole table.
  useEffect(() => session.setSpeed(speed), [session, speed]);

  const online = lobby.players;
  const seats = useMemo(
    () => seatInfos(lobby, (id) => !online.find((p) => p.id === id)?.online),
    [lobby, online],
  );
  if (!latest || !display.shown) return null;
  const settled = !display.busy;
  const view = display.shown;
  const ready = readyGate(latest, snap.ready, mySeat, settled);
  return {
    view,
    anim: display.anim,
    busy: !settled,
    perspective: mySeat ?? 0,
    seats,
    canAct: settled && !ready && view.phase === 'playing' && mySeat !== null && view.hand.turn === mySeat,
    play,
    canContinue: true,
    continueAfterHand: next,
    passTo: null,
    reveal: noop,
    tutorial,
    setTutorial,
    thinking: snap.thinking,
    notice: snap.status !== 'connected' ? t.online.reconnecting : awayNotice(seats, t),
    mode: 'online',
    spectator: mySeat === null,
    ready,
    readyUp,
    scopa: display.scopa,
  };
}

/** Game controller for a guest. Null until the host has sent a game state. */
export function useGuestController(session: GuestSession, speed: Speed, t: Dict): GameController | null {
  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [tutorial, setTutorial] = useState(false);
  const display = useDisplay(snap.view, TIMINGS[speed]);
  const play = useCallback((move: Move) => void session.play(move), [session]);
  const readyUp = useCallback(() => void session.ready(), [session]);
  const noop = useCallback(() => undefined, []);
  if (!snap.view || !display.shown) return null;
  const settled = !display.busy;
  const view = display.shown;
  const seat: Seat | null = snap.seat;
  let notice: string | null = null;
  if (snap.status !== 'connected') notice = t.online.reconnecting;
  else if (!snap.hostOnline) notice = t.online.hostAway;
  else if (seat === null) notice = t.online.notSeated;
  else notice = awayNotice(snap.seats, t);
  const ready = readyGate(snap.view, snap.ready, seat, settled && snap.hostOnline);
  return {
    view,
    anim: display.anim,
    busy: !settled,
    perspective: seat ?? 0,
    seats: snap.seats,
    canAct: settled && !ready && snap.hostOnline && view.phase === 'playing' && seat !== null && view.hand.turn === seat,
    play,
    canContinue: false,
    continueAfterHand: noop,
    passTo: null,
    reveal: noop,
    tutorial,
    setTutorial,
    thinking: null,
    notice,
    mode: 'online',
    spectator: seat === null,
    ready,
    readyUp,
    scopa: display.scopa,
  };
}
