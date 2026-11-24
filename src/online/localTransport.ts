import type { PresenceMeta, Transport, TransportHandlers } from './transport';

type Wire =
  | { t: 'msg'; event: string; payload: unknown }
  | { t: 'here'; meta: PresenceMeta }
  | { t: 'who' }
  | { t: 'gone'; id: string };

const BEAT_MS = 800;
const STALE_MS = 2600;

/** Rooms between tabs of one browser, with heartbeat-based presence. No server. */
export class LocalTransport implements Transport {
  private channel: BroadcastChannel | null = null;
  private meta: PresenceMeta | null = null;
  private handlers: TransportHandlers | null = null;
  private peers = new Map<string, { meta: PresenceMeta; seen: number }>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private onHide = () => this.post({ t: 'gone', id: this.meta?.id ?? '' });

  join(room: string, meta: PresenceMeta, handlers: TransportHandlers): void {
    this.meta = meta;
    this.handlers = handlers;
    this.channel = new BroadcastChannel(`scopone-room-${room}`);
    this.channel.onmessage = (ev: MessageEvent<Wire>) => this.receive(ev.data);
    this.timer = setInterval(() => this.beat(), BEAT_MS);
    window.addEventListener('pagehide', this.onHide);
    handlers.onStatus('connected');
    this.post({ t: 'who' });
    this.beat();
  }

  private post(msg: Wire): void {
    try {
      this.channel?.postMessage(msg);
    } catch {
      /* channel closed */
    }
  }

  private beat(): void {
    if (this.meta) this.post({ t: 'here', meta: this.meta });
    const now = Date.now();
    let changed = false;
    for (const [id, p] of this.peers) {
      if (now - p.seen > STALE_MS) {
        this.peers.delete(id);
        changed = true;
      }
    }
    if (changed) this.emitPresence();
  }

  private emitPresence(): void {
    if (!this.meta || !this.handlers) return;
    this.handlers.onPresence([this.meta, ...[...this.peers.values()].map((p) => p.meta)]);
  }

  private receive(msg: Wire): void {
    if (!this.handlers) return;
    if (msg.t === 'msg') this.handlers.onMessage(msg.event, msg.payload);
    else if (msg.t === 'who') this.beat();
    else if (msg.t === 'gone') {
      if (this.peers.delete(msg.id)) this.emitPresence();
    } else if (msg.t === 'here') {
      const known = this.peers.get(msg.meta.id);
      this.peers.set(msg.meta.id, { meta: msg.meta, seen: Date.now() });
      if (!known || known.meta.name !== msg.meta.name) this.emitPresence();
    }
  }

  send(event: string, payload: unknown): void {
    this.post({ t: 'msg', event, payload });
  }

  leave(): void {
    if (this.meta) this.post({ t: 'gone', id: this.meta.id });
    if (this.timer) clearInterval(this.timer);
    window.removeEventListener('pagehide', this.onHide);
    this.channel?.close();
    this.channel = null;
    this.handlers = null;
    this.peers.clear();
  }
}
