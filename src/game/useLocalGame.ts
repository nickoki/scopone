/**
 * Controller for games played on this device: vs computer and pass-and-play.
 * It owns the real match state, asks the AI worker for the computer's moves
 * and decides whose hand may be visible.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { requestAiMove } from '../ai/client';
import { nextHand, playMove, viewFor, type MatchState, type Move, type Seat } from '../engine';
import type { Speed } from '../state/settings';
import { readyOrder } from './ready';
import { TIMINGS, useDisplay } from './useDisplay';
import type { GameController, LocalGame, ReadyGate, SeatInfo } from './types';

const THINK_DELAY: Record<Speed, number> = { slow: 1400, normal: 650, fast: 200 };
/** Monte Carlo budget for Difficile; well under a second even on older phones. */
const AI_BUDGET_MS = 480;

function firstHumanFrom(game: LocalGame, from: number): Seat | null {
  for (let i = 0; i < 4; i++) {
    const s = ((from + i) & 3) as Seat;
    if (game.seats[s]!.kind === 'human') return s;
  }
  return null;
}

export function useLocalGame(
  game: LocalGame,
  speed: Speed,
  onChange: (game: LocalGame) => void,
): GameController {
  const [match, setMatch] = useState<MatchState>(game.match);
  const [tutorial, setTutorialState] = useState(game.tutorial);
  const humanSeats = useMemo(() => game.seats.map((s) => s.kind === 'human'), [game.seats]);
  const humans = humanSeats.filter(Boolean).length;
  const multi = humans >= 2;

  // Pass-and-play: the seat whose cards are currently face up (null = nobody's).
  const [revealed, setRevealed] = useState<Seat | null>(null);
  const [thinking, setThinking] = useState<Seat | null>(null);
  // Who has pressed Ready for which hand.
  const [readyState, setReadyState] = useState<{ hand: number; seats: Seat[] }>({ hand: 0, seats: [] });

  const matchRef = useRef(match);
  matchRef.current = match;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const gameRef = useRef(game);
  gameRef.current = game;

  // Persist every change so the game can be resumed.
  useEffect(() => {
    onChangeRef.current({ ...gameRef.current, match, tutorial, savedAt: Date.now() });
  }, [match, tutorial]);

  const turn = match.hand.turn;
  const turnIsHuman = match.phase === 'playing' && game.seats[turn]!.kind === 'human';

  // ---- start-of-hand gate: every human looks at their cards and presses Ready
  const handStart = match.phase === 'playing' && match.hand.history.length === 0;
  const readySeats = readyState.hand === match.handNumber ? readyState.seats : [];
  const pendingReady = handStart ? readyOrder(humanSeats, turn).filter((s) => !readySeats.includes(s)) : [];
  const waitingReady = pendingReady.length > 0;
  /** The person who has to look at their cards and get ready next. */
  const readySeat: Seat | null = waitingReady ? pendingReady[0]! : null;

  // Which seat is at the bottom of the screen, and whose hand is visible.
  let perspective: Seat;
  let visible: Seat[];
  if (humans === 0) {
    perspective = 0;
    visible = [0];
  } else if (!multi) {
    perspective = firstHumanFrom(game, 0)!;
    visible = [perspective];
  } else if (revealed !== null) {
    perspective = revealed;
    visible = [revealed];
  } else {
    perspective = readySeat ?? firstHumanFrom(game, turn) ?? 0;
    visible = [];
  }

  const latest = useMemo(() => viewFor(match, visible), [match, visible.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const display = useDisplay(latest, TIMINGS[speed]);
  const settled = !display.busy && display.shown === latest;

  // Pass-and-play: someone else's turn to hold the phone -> hide the hand and ask to pass it.
  const wanted: Seat | null = waitingReady ? readySeat : turnIsHuman ? turn : null;
  const passTo: Seat | null = multi && wanted !== null && revealed !== wanted && settled ? wanted : null;
  const passRef = useRef(passTo);
  passRef.current = passTo;

  // A new hand starts face down in pass-and-play.
  const handNumber = match.handNumber;
  const lastHand = useRef(handNumber);
  useEffect(() => {
    if (lastHand.current !== handNumber) {
      lastHand.current = handNumber;
      if (multi) setRevealed(null);
    }
  }, [handNumber, multi]);

  // Computer players.
  useEffect(() => {
    if (match.phase !== 'playing' || !settled || waitingReady) return;
    const seat = match.hand.turn;
    const cfg = game.seats[seat]!;
    if (cfg.kind !== 'ai') return;
    let cancelled = false;
    setThinking(seat);
    const started = Date.now();
    const seed = (match.seed ^ Math.imul(match.handNumber * 131 + match.hand.history.length + 1, 0x9e3779b1)) | 0;
    void requestAiMove(viewFor(match, [seat]), seat, { level: cfg.level, seed, budgetMs: AI_BUDGET_MS }).then(
      async (move) => {
        const rest = THINK_DELAY[speed] - (Date.now() - started);
        if (rest > 0) await new Promise((r) => setTimeout(r, rest));
        if (cancelled || matchRef.current !== match) return;
        setThinking(null);
        setMatch(playMove(match, move));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [match, settled, waitingReady, game.seats, speed]);

  const canAct =
    settled && !waitingReady && turnIsHuman && passTo === null && visible.includes(turn) && perspective === turn;

  const play = useCallback((move: Move) => {
    const m = matchRef.current;
    if (m.phase !== 'playing') return;
    try {
      setMatch(playMove(m, move));
    } catch {
      /* illegal tap: ignore */
    }
  }, []);

  const continueAfterHand = useCallback(() => {
    const m = matchRef.current;
    if (m.phase === 'handEnd') setMatch(nextHand(m));
  }, []);

  const reveal = useCallback(() => {
    if (passRef.current !== null) setRevealed(passRef.current);
  }, []);

  const canReady = waitingReady && settled && passTo === null && (!multi || revealed === readySeat);
  const readyRef = useRef<Seat | null>(null);
  readyRef.current = canReady ? readySeat : null;
  const readyUp = useCallback(() => {
    const seat = readyRef.current;
    if (seat === null) return;
    const hand = matchRef.current.handNumber;
    setReadyState((prev) => ({ hand, seats: [...(prev.hand === hand ? prev.seats : []), seat] }));
  }, []);

  const ready: ReadyGate | null = waitingReady
    ? { seats: humanSeats.map((human, s) => !human || readySeats.includes(s as Seat)), canReady }
    : null;

  const seats: SeatInfo[] = useMemo(
    () => game.seats.map((s) => ({ name: s.name, kind: s.kind, level: s.kind === 'ai' ? s.level : undefined })),
    [game.seats],
  );

  const shown = display.shown ?? latest;

  return {
    view: shown,
    anim: display.anim,
    busy: !settled,
    perspective,
    seats,
    canAct,
    play,
    canContinue: true,
    continueAfterHand,
    passTo,
    reveal,
    tutorial,
    setTutorial: setTutorialState,
    thinking: thinking !== null && match.phase === 'playing' && match.hand.turn === thinking ? thinking : null,
    notice: null,
    mode: game.mode,
    spectator: humans === 0,
    ready,
    readyUp,
    scopa: display.scopa,
  };
}
