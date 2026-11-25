import type { AiLevel } from '../ai/types';
import type { MatchState, Move, Rules, Seat } from '../engine';
import type { SeatInfo } from '../game/types';
import type { Sealed } from './crypto';

export type LobbySeat = { kind: 'ai'; level: AiLevel } | { kind: 'player'; id: string; name: string };

export interface RoomPlayer {
  id: string;
  name: string;
  online: boolean;
  host: boolean;
}

/** Public room information, broadcast in clear by the host. */
export interface Lobby {
  code: string;
  hostId: string;
  seats: LobbySeat[];
  rules: Rules;
  started: boolean;
  /** Changes with every new match, so clients can tell a rematch from a stale message. */
  gameId: number;
  players: RoomPlayer[];
}

/** host -> one guest, encrypted: the game as that guest may see it. */
export interface GuestState {
  gameId: number;
  view: MatchState;
  seat: Seat | null;
  seats: SeatInfo[];
  /** Start of a hand: which seats have pressed Ready (computer and absent seats count as ready). */
  ready: boolean[];
}

/** guest -> host, encrypted. */
export type GuestAction =
  | { type: 'move'; move: Move; handNumber: number; n: number }
  | { type: 'ready'; handNumber: number };

export interface StateMsg extends Sealed {
  to: string;
}

export interface ActionMsg extends Sealed {
  from: string;
}

export interface HelloMsg {
  from: string;
}

export const AI_SEAT_NAMES = ['Lina', 'Gino', 'Rosa', 'Beppe'] as const;

export function seatInfos(lobby: Lobby, offline: (id: string) => boolean): SeatInfo[] {
  return lobby.seats.map((s, i) =>
    s.kind === 'ai'
      ? { name: AI_SEAT_NAMES[i]!, kind: 'ai', level: s.level }
      : { name: s.name, kind: 'human', away: offline(s.id) },
  );
}
