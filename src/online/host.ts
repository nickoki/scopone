/**
 * The host runs the game: it holds the only full copy of the match, deals,
 * validates every move with the rules engine, plays the AI seats (and the
 * seats of disconnected players) and sends each guest only what that guest is
 * allowed to see, encrypted for them.
 */
import { requestAiMove } from '../ai/client';
import type { AiLevel } from '../ai/types';
import {
  createMatch,
  nextHand,
  playMove,
  randomSeed,
  viewFor,
  type MatchState,
  type Move,
  type Rules,
  type Seat,
} from '../engine';
import { KEYS, removeKey, saveJson } from '../state/storage';
import { deriveSharedKey, publicId, seal, unseal, type Identity } from './crypto';
import {
  seatInfos,
  type ActionMsg,
  type GuestAction,
  type GuestState,
  type HelloMsg,
  type Lobby,
  type LobbySeat,
  type StateMsg,
} from './protocol';
import { PROTOCOL_VERSION, type PresenceMeta, type Transport, type TransportStatus } from './transport';

export interface SavedHostRoom {
  code: string;
  name: string;
  lobby: Lobby;
  match: MatchState | null;
  savedAt: number;
}

export interface HostSnapshot {
  role: 'host';
  status: TransportStatus;
  /** Last connection error reported by the server, if any. */
  error: string | null;
  lobby: Lobby;
  match: MatchState | null;
  mySeat: Seat | null;
  thinking: Seat | null;
  /** Start of a hand: which seats are ready (computer and absent seats always are). */
  ready: boolean[];
}

interface Peer {
  meta: PresenceMeta;
  key: CryptoKey | null;
  online: boolean;
  awaySince: number;
}

/** How long a dropped player's seat waits before the computer covers for them. */
const AWAY_GRACE_MS = 5000;
/** Pause before a computer move / time the deal animation needs, by game speed. */
const AI_DELAY_MS = { slow: 2600, normal: 1250, fast: 900 } as const;
const DEAL_MS = { slow: 3600, normal: 2700, fast: 2000 } as const;
const AUTO_SEAT_ORDER = [1, 2, 3];

export class HostSession {
  readonly role = 'host' as const;
  private listeners = new Set<() => void>();
  private peers = new Map<string, Peer>();
  private snapshot: HostSnapshot;
  private aiTimer: ReturnType<typeof setTimeout> | null = null;
  private aiToken = 0;
  private closed = false;
  private speed: keyof typeof AI_DELAY_MS = 'normal';
  private handStartedAt = 0;
  /** Seats that pressed Ready, and the hand (`gameId:handNumber`) they did it for. */
  private readySet = new Set<number>();
  private readyKey = '';

  constructor(
    private transport: Transport,
    private identity: Identity,
    private name: string,
    code: string,
    rules: Rules,
    restore?: SavedHostRoom,
  ) {
    const lobby: Lobby = restore?.lobby ?? {
      code,
      hostId: identity.id,
      seats: [
        { kind: 'player', id: identity.id, name },
        { kind: 'ai', level: 'medio' },
        { kind: 'ai', level: 'medio' },
        { kind: 'ai', level: 'medio' },
      ],
      rules: { ...rules },
      started: false,
      gameId: 0,
      players: [],
    };
    lobby.players = [{ id: identity.id, name, online: true, host: true }];
    this.snapshot = {
      role: 'host',
      status: 'connecting',
      error: null,
      lobby,
      match: restore?.match ?? null,
      mySeat: null,
      thinking: null,
      ready: [true, true, true, true],
    };
    this.snapshot.mySeat = this.seatOf(identity.id);
    this.snapshot.ready = this.readyFlags();
  }

  // ------------------------------------------------------------ store API
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = (): HostSnapshot => this.snapshot;

  private set(patch: Partial<HostSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.snapshot.mySeat = this.seatOf(this.identity.id);
    this.snapshot.ready = this.readyFlags();
    this.persist();
    for (const fn of this.listeners) fn();
  }

  private persist(): void {
    const { lobby, match } = this.snapshot;
    const saved: SavedHostRoom = { code: lobby.code, name: this.name, lobby, match, savedAt: Date.now() };
    saveJson(KEYS.hostRoom, saved);
  }

  private seatOf(id: string): Seat | null {
    const i = this.snapshot.lobby.seats.findIndex((s) => s.kind === 'player' && s.id === id);
    return i >= 0 ? (i as Seat) : null;
  }

  private isOffline = (id: string): boolean => id !== this.identity.id && !this.peers.get(id)?.online;

  // ---------------------------------------------------- start-of-hand gate
  /** Per seat: ready for the current hand. Computer seats and absent players never hold the table up. */
  private readyFlags(): boolean[] {
    const { match, lobby } = this.snapshot;
    const key = match ? `${lobby.gameId}:${match.handNumber}` : '';
    if (key !== this.readyKey) {
      this.readyKey = key;
      this.readySet = new Set();
    }
    // A guest still running a version without the Ready button must not block the table.
    const cannotReady = (id: string) => id !== this.identity.id && (this.peers.get(id)?.meta.v ?? 1) < 2;
    return lobby.seats.map(
      (s, i) => s.kind === 'ai' || this.isOffline(s.id) || cannotReady(s.id) || this.readySet.has(i),
    );
  }

  /** True once play may proceed: a card has been played, or everybody is ready. */
  private gateOpen(): boolean {
    const match = this.snapshot.match;
    if (!match || match.phase !== 'playing' || match.hand.history.length > 0) return true;
    return this.readyFlags().every(Boolean);
  }

  private markReady(seat: number): void {
    this.readyFlags(); // make sure the set belongs to the current hand
    if (this.readySet.has(seat)) return;
    this.readySet.add(seat);
    this.set({});
    this.broadcastStates();
    this.tick();
  }

  /** Animation speed chosen on the host's device: paces the computer's moves for everyone. */
  setSpeed(speed: keyof typeof AI_DELAY_MS): void {
    this.speed = speed;
  }

  // ------------------------------------------------------------ lifecycle
  start(): void {
    this.transport.join(
      this.snapshot.lobby.code,
      { id: this.identity.id, name: this.name, pub: this.identity.pub, host: true, v: PROTOCOL_VERSION },
      {
        onStatus: (status, detail) => {
          this.set({ status, error: status === 'connected' ? null : (detail ?? this.snapshot.error) });
          if (status === 'connected') this.broadcastLobby();
        },
        onPresence: (list) => void this.onPresence(list),
        onMessage: (event, payload) => void this.onMessage(event, payload),
      },
    );
    this.tick();
  }

  /** Leave but keep the room saved (it can be reopened). */
  suspend(): void {
    this.closed = true;
    if (this.aiTimer) clearTimeout(this.aiTimer);
    this.transport.leave();
  }

  /** Close the room for everyone. */
  close(): void {
    this.transport.send('bye', {});
    removeKey(KEYS.hostRoom);
    this.closed = true;
    if (this.aiTimer) clearTimeout(this.aiTimer);
    // Give the goodbye a moment to leave before the socket closes.
    setTimeout(() => this.transport.leave(), 150);
  }

  // ------------------------------------------------------------- presence
  private async onPresence(list: PresenceMeta[]): Promise<void> {
    const present = new Set<string>();
    const arrived: string[] = [];
    for (const meta of list) {
      if (meta.id === this.identity.id || meta.host) continue;
      // The id must really be the hash of the key, otherwise anyone could claim a seat.
      if ((await publicId(meta.pub).catch(() => '')) !== meta.id) continue;
      present.add(meta.id);
      let peer = this.peers.get(meta.id);
      if (!peer) {
        peer = { meta, key: null, online: false, awaySince: 0 };
        this.peers.set(meta.id, peer);
      }
      peer.meta = meta;
      if (!peer.online) arrived.push(meta.id);
      peer.online = true;
    }
    if (this.closed) return;
    for (const [id, peer] of this.peers) {
      if (!present.has(id) && peer.online) {
        peer.online = false;
        peer.awaySince = Date.now();
      }
    }

    const lobby = this.cloneLobby();
    // Newcomers take the first computer seat while the game has not started.
    if (!lobby.started) {
      for (const id of arrived) {
        if (lobby.seats.some((s) => s.kind === 'player' && s.id === id)) continue;
        const free = AUTO_SEAT_ORDER.find((i) => lobby.seats[i]!.kind === 'ai');
        if (free !== undefined) lobby.seats[free] = { kind: 'player', id, name: this.peers.get(id)!.meta.name };
      }
    }
    this.refreshPlayers(lobby);
    this.set({ lobby });
    this.broadcastLobby();
    // Everyone gets a fresh state: who is here also decides who we are waiting for.
    this.broadcastStates();
    this.tick();
  }

  private cloneLobby(): Lobby {
    const l = this.snapshot.lobby;
    return { ...l, seats: l.seats.map((s) => ({ ...s })), players: l.players.slice() };
  }

  private refreshPlayers(lobby: Lobby): void {
    const seated = new Set(lobby.seats.flatMap((s) => (s.kind === 'player' ? [s.id] : [])));
    lobby.players = [{ id: this.identity.id, name: this.name, online: true, host: true }];
    for (const [id, peer] of this.peers) {
      if (peer.online || seated.has(id)) lobby.players.push({ id, name: peer.meta.name, online: peer.online, host: false });
    }
    lobby.seats = lobby.seats.map((s) =>
      s.kind === 'player' && this.peers.has(s.id) ? { ...s, name: this.peers.get(s.id)!.meta.name } : s,
    );
  }

  // ------------------------------------------------------------- messages
  private async keyFor(id: string): Promise<CryptoKey | null> {
    const peer = this.peers.get(id);
    if (!peer) return null;
    if (!peer.key) peer.key = await deriveSharedKey(this.identity.priv, peer.meta.pub).catch(() => null);
    return peer.key;
  }

  private broadcastLobby(): void {
    this.transport.send('lobby', this.snapshot.lobby);
  }

  private async sendState(id: string): Promise<void> {
    const { match, lobby } = this.snapshot;
    const peer = this.peers.get(id);
    if (!match || !peer?.online) return;
    const key = await this.keyFor(id);
    if (!key) return;
    const seat = this.seatOf(id);
    const state: GuestState = {
      gameId: lobby.gameId,
      view: viewFor(match, seat === null ? [] : [seat]),
      seat,
      seats: seatInfos(lobby, this.isOffline),
      ready: this.readyFlags(),
    };
    const sealed = await seal(key, state);
    if (this.snapshot.match !== match) return; // superseded while encrypting
    const msg: StateMsg = { to: id, ...sealed };
    this.transport.send('state', msg);
  }

  private broadcastStates(): void {
    for (const [id, peer] of this.peers) if (peer.online) void this.sendState(id);
  }

  private async onMessage(event: string, payload: unknown): Promise<void> {
    if (this.closed) return;
    if (event === 'hello') {
      const { from } = payload as HelloMsg;
      this.broadcastLobby();
      if (typeof from === 'string') void this.sendState(from);
      return;
    }
    if (event !== 'action') return;
    const msg = payload as ActionMsg;
    const key = await this.keyFor(msg.from);
    if (!key) return;
    let action: GuestAction;
    try {
      action = await unseal<GuestAction>(key, msg);
    } catch {
      return; // not from the holder of that seat's key
    }
    const match = this.snapshot.match;
    if (!match) return;
    const seat = this.seatOf(msg.from);
    if (action.type === 'ready') {
      if (seat !== null && action.handNumber === match.handNumber && match.hand.history.length === 0) this.markReady(seat);
      return;
    }
    if (action.type !== 'move') return;
    if (
      seat === null ||
      !this.gateOpen() ||
      match.phase !== 'playing' ||
      match.hand.turn !== seat ||
      action.handNumber !== match.handNumber ||
      action.n !== match.hand.history.length
    ) {
      void this.sendState(msg.from); // stale or out of turn: resync that client
      return;
    }
    this.applyMove(action.move);
  }

  // ----------------------------------------------------------------- game
  private applyMove(move: Move): void {
    const match = this.snapshot.match;
    if (!match) return;
    let next: MatchState;
    try {
      next = playMove(match, move);
    } catch {
      return;
    }
    this.set({ match: next, thinking: null });
    this.broadcastStates();
    this.tick();
  }

  /** Decide whether the computer has to move, now or after a grace period. */
  private tick(): void {
    if (this.aiTimer) clearTimeout(this.aiTimer);
    this.aiTimer = null;
    const token = ++this.aiToken;
    const { match, lobby } = this.snapshot;
    if (this.closed || !match || match.phase !== 'playing' || !this.gateOpen()) return;
    const seat = match.hand.turn;
    const s = lobby.seats[seat]!;
    let level: AiLevel;
    let delay: number = AI_DELAY_MS[this.speed];
    // First card of a hand: never before the deal animation has had time to finish.
    if (match.hand.history.length === 0) delay = Math.max(delay, DEAL_MS[this.speed] - (Date.now() - this.handStartedAt));
    if (s.kind === 'ai') level = s.level;
    else if (this.isOffline(s.id)) {
      level = 'medio';
      const since = this.peers.get(s.id)?.awaySince ?? 0;
      delay = Math.max(delay, AWAY_GRACE_MS - (Date.now() - since));
    } else return;

    this.aiTimer = setTimeout(() => {
      if (token !== this.aiToken || this.snapshot.match !== match) return;
      this.set({ thinking: seat });
      const seed = (match.seed ^ Math.imul(match.handNumber * 131 + match.hand.history.length + 1, 0x9e3779b1)) | 0;
      void requestAiMove(viewFor(match, [seat]), seat, { level, seed, budgetMs: 450 }).then((move) => {
        if (token !== this.aiToken || this.snapshot.match !== match || this.closed) return;
        this.applyMove(move);
      });
    }, delay);
  }

  // -------------------------------------------------------- host actions
  /** Put a player or a computer in a seat; a moved player swaps with the previous occupant. */
  assignSeat(index: number, seat: LobbySeat): void {
    if (this.snapshot.lobby.started) return;
    const lobby = this.cloneLobby();
    if (seat.kind === 'player') {
      const from = lobby.seats.findIndex((s) => s.kind === 'player' && s.id === seat.id);
      if (from >= 0 && from !== index) lobby.seats[from] = lobby.seats[index]!;
    }
    lobby.seats[index] = seat;
    this.refreshPlayers(lobby);
    this.set({ lobby });
    this.broadcastLobby();
  }

  setRules(patch: Partial<Rules>): void {
    if (this.snapshot.lobby.started) return;
    const lobby = this.cloneLobby();
    lobby.rules = { ...lobby.rules, ...patch };
    this.set({ lobby });
    this.broadcastLobby();
  }

  startGame(): void {
    const lobby = this.cloneLobby();
    lobby.started = true;
    lobby.gameId = Date.now();
    this.handStartedAt = Date.now();
    this.set({ lobby, match: createMatch(lobby.rules, randomSeed()), thinking: null });
    this.broadcastLobby();
    this.broadcastStates();
    this.tick();
  }

  /** The host's own move. */
  play(move: Move): void {
    const { match, mySeat } = this.snapshot;
    if (!match || mySeat === null || match.phase !== 'playing' || match.hand.turn !== mySeat || !this.gateOpen()) return;
    this.applyMove(move);
  }

  /** The host presses Ready at the start of a hand. */
  readyUp(): void {
    const { match, mySeat } = this.snapshot;
    if (match && mySeat !== null && match.phase === 'playing' && match.hand.history.length === 0) this.markReady(mySeat);
  }

  nextHand(): void {
    const match = this.snapshot.match;
    if (!match || match.phase !== 'handEnd') return;
    this.handStartedAt = Date.now();
    this.set({ match: nextHand(match), thinking: null });
    this.broadcastStates();
    this.tick();
  }

  /** After the match: back to the lobby with the same seats. */
  backToLobby(): void {
    const lobby = this.cloneLobby();
    lobby.started = false;
    this.set({ lobby, match: null, thinking: null });
    this.broadcastLobby();
  }
}
