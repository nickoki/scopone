import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { EVENTS, type PresenceMeta, type Transport, type TransportHandlers } from './transport';

/**
 * Supabase Realtime: Broadcast for messages, Presence for who is in the room.
 * No database tables are used, so there is nothing to migrate or secure:
 * the anon key only lets a client join channels.
 */
export class SupabaseTransport implements Transport {
  private client: SupabaseClient;
  private channel: RealtimeChannel | null = null;
  private room = '';
  private meta: PresenceMeta | null = null;
  private handlers: TransportHandlers | null = null;
  private joined = false;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

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
    this.open();
  }

  /** iOS suspends sockets in the background: reconnect as soon as we are visible again. */
  private onVisible = () => {
    if (document.visibilityState === 'visible' && !this.joined && !this.closed) this.open();
  };

  private open(): void {
    if (this.closed || !this.meta || !this.handlers) return;
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    const old = this.channel;
    if (old) void this.client.removeChannel(old);
    this.joined = false;
    this.handlers.onStatus('connecting');

    const handlers = this.handlers;
    const meta = this.meta;
    const channel = this.client.channel(`scopone:${this.room}`, {
      config: { broadcast: { self: false, ack: false }, presence: { key: meta.id, enabled: true } },
    });
    this.channel = channel;

    for (const event of EVENTS) {
      channel.on('broadcast', { event }, (msg) => handlers.onMessage(event, msg.payload));
    }
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<PresenceMeta>();
      const peers = new Map<string, PresenceMeta>();
      for (const entries of Object.values(state)) {
        for (const e of entries) {
          if (e && typeof e.id === 'string' && e.pub) peers.set(e.id, { id: e.id, name: e.name, pub: e.pub, host: e.host });
        }
      }
      handlers.onPresence([...peers.values()]);
    });
    channel.subscribe((status) => {
      if (channel !== this.channel) return;
      if (status === 'SUBSCRIBED') {
        this.joined = true;
        handlers.onStatus('connected');
        void channel.track(meta);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        this.joined = false;
        if (this.closed) return;
        handlers.onStatus('disconnected');
        if (!this.retry) this.retry = setTimeout(() => this.open(), 2500);
      }
    });
  }

  send(event: string, payload: unknown): void {
    if (!this.channel || !this.joined) return;
    void this.channel.send({ type: 'broadcast', event, payload });
  }

  leave(): void {
    this.closed = true;
    if (this.retry) clearTimeout(this.retry);
    document.removeEventListener('visibilitychange', this.onVisible);
    window.removeEventListener('online', this.onVisible);
    const ch = this.channel;
    this.channel = null;
    this.handlers = null;
    if (ch) {
      void ch.untrack().catch(() => undefined);
      void this.client.removeChannel(ch);
    }
    void this.client.removeAllChannels();
  }
}
