import type { AiLevel } from '../ai/types';
import type { MatchState, Move, PlayedMove, Seat } from '../engine';

export type LocalMode = 'ai' | 'pass';

export interface SeatConfig {
  kind: 'human' | 'ai';
  name: string;
  level: AiLevel;
}

/** A local (vs computer / pass-and-play) game as stored in localStorage. */
export interface LocalGame {
  mode: LocalMode;
  seats: SeatConfig[];
  match: MatchState;
  tutorial: boolean;
  savedAt: number;
}

/** A capture being shown before the cards are collected. */
export interface CaptureAnim {
  move: PlayedMove;
}

export interface SeatInfo {
  name: string;
  /** 'human' = someone taps for this seat somewhere; 'ai' = computer. */
  kind: 'human' | 'ai';
  level?: AiLevel;
  /** Online: a human seat whose player is disconnected (AI is covering). */
  away?: boolean;
}

export interface ReadyGate {
  /** Per seat: ready (computer seats always are). */
  seats: boolean[];
  /** The seat at the bottom of this screen can press Ready now. */
  canReady: boolean;
}

/** Everything the game screen needs, whatever the mode. */
export interface GameController {
  /** The state being displayed (may lag the real state while animating). Hands are masked. */
  view: MatchState;
  anim: CaptureAnim | null;
  /** Animations are running: input is ignored. */
  busy: boolean;
  /** The seat drawn at the bottom of the screen. */
  perspective: Seat;
  seats: SeatInfo[];
  /** The perspective seat may play a card right now. */
  canAct: boolean;
  play: (move: Move) => void;
  /** Hand-end screen: is this device allowed to deal the next hand? */
  canContinue: boolean;
  continueAfterHand: () => void;
  /** Pass-and-play: who must take the phone before the hand is revealed. */
  passTo: Seat | null;
  reveal: () => void;
  tutorial: boolean;
  setTutorial: (on: boolean) => void;
  /** Seat currently being computed by an AI (for the "thinking" indicator). */
  thinking: Seat | null;
  /** Optional status line (online connection problems, etc.). */
  notice: string | null;
  mode: LocalMode | 'online';
  /** True when the local device has no seat (watching). */
  spectator: boolean;
  /**
   * Start-of-hand gate: after the deal nobody plays until every human has
   * pressed Ready. Null once play is under way.
   */
  ready: ReadyGate | null;
  readyUp: () => void;
  /** Last scopa shown (drives the banner); `key` changes for every new one. */
  scopa: { seat: number; key: number } | null;
}
