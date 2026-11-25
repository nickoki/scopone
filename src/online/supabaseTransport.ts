import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { EVENTS, type PresenceMeta, type Transport, type TransportHandlers } from './transport';

/**
 * Supabase Realtime: Broadcast for messages, Presence for who is in the room.
 * No database tables are used, so there is nothing to migrate or secure:
 * the anon/publishable key only lets a client join channels.
 *
 * Reconnection: after an error or a timeout the Supabase client rejoins the
 * channel (and reopens the socket) by itself, so we only build a new channel
 * when the old one is completely closed — and only after it has been removed,
 * because `client.channel()` hands back an existing channel with the same name.
 */
export class SupabaseTransport implements Transport {
  private client: SupabaseClient;
  private channel: RealtimeChannel | null = null;
  private room = '';
  private meta: PresenceMeta | null = null;
  private handlers: TransportHandlers | null = null;
  private joined = false;
  private closed = false;
  private reopening = false;
  private retry: ReturnType<typeof setTimeout> | null = null;

  constructor(url: string, anonKey: string) {
    this.client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      realtime: { params: { eventsPerSecond: 20 } },
    });
  }

  join(room: string, meta: PresenceMeta, handlers: TransportHandlers): void {
    this.room = room;
    this.meta = meta;
    this.handlers = handlers;
    this.closed = false;
    document.addEventListener('visibilitychange', this.onVisible);
    window.addEventListener('online', this.onVisible);
    void this.open();
  }

  /** iOS suspends sockets in the background: nudge the client when we are visible again. */
  private onVisible = () => {
    if (document.visibilityState !== 'visible' || this.closed || this.joined) return;
    try {
      this.client.realtime.connect();
    } catch {
      /* already connecting */
    }
    if (!this.channel) void this.open();
  };

  private topic(): string {
    return `scopone:${this.room}`;
  }

  /** Remove every channel for this room still registered in the client. */
  private async dropChannels(): Promise<void> {
    const realtimeTopic = `realtime:${this.topic()}`;
    for (const ch of this.client.getChannels()) {
      if (ch.topic !== realtimeTopic) continue;
      try {
        await this.client.removeChannel(ch);
      } catch {
        /* ignore */
      }
    }
    // If an unsubscribe could not complete (socket down), force it out of the client.
    const realtime = this.client.realtime as unknown as { channels: RealtimeChannel[] };
    if (Array.isArray(realtime.channels)) {
      for (const ch of realtime.channels.filter((c) => c.topic === realtimeTopic)) {
        try {
          ch.teardown();
        } catch {
          /* ignore */
        }
      }
      realtime.channels = realtime.channels.filter((c) => c.topic !== realtimeTopic);
    }
  }

  private async open(): Promise<void> {
    if (this.closed || !this.meta || !this.handlers || this.reopening) return;
    this.reopening = true;
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    this.joined = false;
    this.channel = null;
    this.handlers.onStatus('connecting');
    await this.dropChannels();
    this.reopening = false;
    if (this.closed || !this.meta || !this.handlers) return;

    const handlers = this.handlers;
    const meta = this.meta;
    const channel = this.client.channel(this.topic(), {
      config: { broadcast: { self: false, ack: false }, presence: { key: meta.id, enabled: true } },
    });
    this.channel = channel;

    for (const event of EVENTS) {
      channel.on('broadcast', { event }, (msg) => {
        if (channel === this.channel) handlers.onMessage(event, msg.payload);
      });
    }
    channel.on('presence', { event: 'sync' }, () => {
      if (channel !== this.channel) return;
      const state = channel.presenceState<PresenceMeta>();
      const peers = new Map<string, PresenceMeta>();
      for (const entries of Object.values(state)) {
        for (const e of entries) {
          if (e && typeof e.id === 'string' && e.pub) peers.set(e.id, { id: e.id, name: e.name, pub: e.pub, host: e.host, v: typeof e.v === 'number' ? e.v : undefined });
        }
      }
      handlers.onPresence([...peers.values()]);
    });

    channel.subscribe((status, err) => {
      if (channel !== this.channel || this.closed) return;
      if (status === 'SUBSCRIBED') {
        this.joined = true;
        handlers.onStatus('connected');
        void channel.track(meta).catch(() => undefined);
        return;
      }
      this.joined = false;
      const detail = describe(status, err);
      console.warn('[scopone] realtime', status, err ?? '');
      handlers.onStatus('disconnected', detail);
      if (status === 'CLOSED') {
        // The channel is gone for good: build a new one shortly.
        if (!this.retry) this.retry = setTimeout(() => void this.open(), 2000);
      }
      // CHANNEL_ERROR / TIMED_OUT: the client keeps rejoining on its own.
    });
  }

  send(event: string, payload: unknown): void {
    if (!this.channel || !this.joined) return;
    void this.channel.send({ type: 'broadcast', event, payload }).catch(() => undefined);
  }

  leave(): void {
    this.closed = true;
    if (this.retry) clearTimeout(this.retry);
    document.removeEventListener('visibilitychange', this.onVisible);
    window.removeEventListener('online', this.onVisible);
    const ch = this.channel;
    this.channel = null;
    this.handlers = null;
    if (ch) void ch.untrack().catch(() => undefined);
    void this.client.removeAllChannels().catch(() => undefined);
  }
}

function describe(status: string, err: unknown): string {
  const parts: string[] = [status];
  let e: unknown = err;
  for (let depth = 0; e && depth < 3; depth++) {
    if (e instanceof Error) {
      if (e.message) parts.push(e.message);
      e = (e as Error & { cause?: unknown }).cause;
    } else if (typeof e === 'object') {
      try {
        parts.push(JSON.stringify(e));
      } catch {
        /* ignore */
      }
      break;
    } else {
      parts.push(String(e));
      break;
    }
  }
  return [...new Set(parts)].join(' — ').slice(0, 300);
}
