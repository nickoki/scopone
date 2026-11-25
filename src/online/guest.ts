/**
 * A guest in an online room. It never holds anything but its own view of the
 * game: the host sends it (encrypted) after every change.
 */
import type { MatchState, Move, Seat } from '../engine';
import type { SeatInfo } from '../game/types';
import { KEYS, removeKey, saveJson } from '../state/storage';
import { deriveSharedKey, seal, unseal, type Identity } from './crypto';
import type { GuestAction, GuestState, HelloMsg, Lobby, StateMsg, ActionMsg } from './protocol';
import { PROTOCOL_VERSION, type PresenceMeta, type Transport, type TransportStatus } from './transport';

export interface SavedGuestRoom {
  code: string;
  name: string;
  savedAt: number;
}

export type GuestPhase = 'connecting' | 'notFound' | 'lobby' | 'playing' | 'closed';

export interface GuestSnapshot {
  role: 'guest';
  status: TransportStatus;
  /** Last connection error reported by the server, if any. */
  error: string | null;
  /** True once we have been trying to connect for a while without success. */
  slow: boolean;
  phase: GuestPhase;
  hostOnline: boolean;
  lobby: Lobby | null;
  view: MatchState | null;
  seat: Seat | null;
  seats: SeatInfo[];
  /** Start of a hand: which seats are ready. */
  ready: boolean[];
  /** Identifies the match in progress (changes on a rematch). */
  gameId: number;
}

const HOST_WAIT_MS = 7000;
/** After this long without a connection, show what is going on instead of a spinner. */
const SLOW_MS = 9000;
/** Repeat our hello until the host has answered (a broadcast can be missed). */
const HELLO_EVERY_MS = 2500;

export class GuestSession {
  readonly role = 'guest' as const;
  private listeners = new Set<() => void>();
  private snapshot: GuestSnapshot = {
    role: 'guest',
    status: 'connecting',
    error: null,
    slow: false,
    phase: 'connecting',
    hostOnline: false,
    lobby: null,
    view: null,
    seat: null,
    seats: [],
    ready: [true, true, true, true],
    gameId: 0,
  };
  private host: PresenceMeta | null = null;
  private key: CryptoKey | null = null;
  private findTimer: ReturnType<typeof setTimeout> | null = null;
  private slowTimer: ReturnType<typeof setTimeout> | null = null;
  private helloTimer: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  private gameId = 0;

  constructor(
    private transport: Transport,
    private identity: Identity,
    private name: string,
    readonly code: string,
  ) {}

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = (): GuestSnapshot => this.snapshot;

  private set(patch: Partial<GuestSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const fn of this.listeners) fn();
  }

  start(): void {
    this.startTimers();
    this.transport.join(
      this.code,
      { id: this.identity.id, name: this.name, pub: this.identity.pub, host: false, v: PROTOCOL_VERSION },
      {
        onStatus: (status, detail) => {
          this.set({ status, error: status === 'connected' ? null : (detail ?? this.snapshot.error) });
          if (status === 'connected') this.armNotFound();
        },
        onPresence: (list) => void this.onPresence(list),
        onMessage: (event, payload) => void this.onMessage(event, payload),
      },
    );
  }

  private startTimers(): void {
    this.slowTimer = setTimeout(() => {
      if (!this.closed && this.snapshot.lobby === null) this.set({ slow: true });
    }, SLOW_MS);
    this.helloTimer = setInterval(() => {
      if (this.closed || this.snapshot.lobby !== null || !this.snapshot.hostOnline) return;
      const hello: HelloMsg = { from: this.identity.id };
      this.transport.send('hello', hello);
    }, HELLO_EVERY_MS);
  }

  private armNotFound(): void {
    if (this.findTimer) clearTimeout(this.findTimer);
    this.findTimer = setTimeout(() => {
      if (!this.closed && !this.snapshot.hostOnline && this.snapshot.lobby === null) this.set({ phase: 'notFound' });
    }, HOST_WAIT_MS);
  }

  private async onPresence(list: PresenceMeta[]): Promise<void> {
    const wanted = this.snapshot.lobby?.hostId;
    const host = list.find((p) => p.host && (!wanted || p.id === wanted)) ?? null;
    if (!host) {
      if (this.snapshot.hostOnline) this.set({ hostOnline: false });
      return;
    }
    const changed = !this.host || this.host.id !== host.id || !this.snapshot.hostOnline;
    if (!this.host || this.host.id !== host.id) {
      this.host = host;
      this.key = await deriveSharedKey(this.identity.priv, host.pub).catch(() => null);
    }
    if (this.closed) return;
    if (changed) {
      this.set({ hostOnline: true, phase: this.snapshot.phase === 'notFound' ? 'connecting' : this.snapshot.phase });
      const hello: HelloMsg = { from: this.identity.id };
      this.transport.send('hello', hello);
    }
  }

  private async onMessage(event: string, payload: unknown): Promise<void> {
    if (this.closed) return;
    if (event === 'bye') {
      removeKey(KEYS.guestRoom);
      this.set({ phase: 'closed', hostOnline: false });
      return;
    }
    if (event === 'lobby') {
      const lobby = payload as Lobby;
      if (!lobby || !Array.isArray(lobby.seats) || lobby.code !== this.code) return;
      if (this.host && lobby.hostId !== this.host.id) return;
      const saved: SavedGuestRoom = { code: this.code, name: this.name, savedAt: Date.now() };
      saveJson(KEYS.guestRoom, saved);
      const phase: GuestPhase = lobby.started ? (this.snapshot.view ? 'playing' : this.snapshot.phase === 'playing' ? 'playing' : 'lobby') : 'lobby';
      this.set({ lobby, phase, view: lobby.started ? this.snapshot.view : null });
      return;
    }
    if (event === 'state') {
      const msg = payload as StateMsg;
      if (msg.to !== this.identity.id || !this.key) return;
      try {
        const state = await unseal<GuestState>(this.key, msg);
        const cur = this.snapshot.view;
        // Ignore anything older than what we already show.
        if (
          cur &&
          state.gameId === this.gameId &&
          (state.view.handNumber < cur.handNumber ||
            (state.view.handNumber === cur.handNumber && state.view.hand.history.length < cur.hand.history.length))
        ) {
          return;
        }
        this.gameId = state.gameId;
        this.set({
          view: state.view,
          seat: state.seat,
          seats: state.seats,
          ready: Array.isArray(state.ready) ? state.ready : [true, true, true, true],
          gameId: state.gameId,
          phase: 'playing',
        });
      } catch {
        /* not for us / corrupted */
      }
    }
  }

  async play(move: Move): Promise<void> {
    const view = this.snapshot.view;
    if (!view || !this.key) return;
    const action: GuestAction = { type: 'move', move, handNumber: view.handNumber, n: view.hand.history.length };
    const msg: ActionMsg = { from: this.identity.id, ...(await seal(this.key, action)) };
    this.transport.send('action', msg);
  }

  /** Tell the host we have looked at our cards and are ready to start the hand. */
  async ready(): Promise<void> {
    const view = this.snapshot.view;
    if (!view || !this.key) return;
    const action: GuestAction = { type: 'ready', handNumber: view.handNumber };
    const msg: ActionMsg = { from: this.identity.id, ...(await seal(this.key, action)) };
    this.transport.send('action', msg);
  }

  leave(forget = true): void {
    this.closed = true;
    if (this.findTimer) clearTimeout(this.findTimer);
    if (this.slowTimer) clearTimeout(this.slowTimer);
    if (this.helloTimer) clearInterval(this.helloTimer);
    if (forget) removeKey(KEYS.guestRoom);
    this.transport.leave();
  }
}
