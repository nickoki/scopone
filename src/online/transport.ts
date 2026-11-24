/**
 * Realtime transport abstraction: a named room where every member can
 * broadcast small JSON messages and see who else is present. Two
 * implementations exist: Supabase Realtime (production) and BroadcastChannel
 * (same-browser tabs; development and automated tests).
 */
export interface PresenceMeta {
  /** Player id (hash of the public key). */
  id: string;
  name: string;
  pub: JsonWebKey;
  host: boolean;
}

export type TransportStatus = 'connecting' | 'connected' | 'disconnected';

export interface TransportHandlers {
  onMessage: (event: string, payload: unknown) => void;
  onPresence: (peers: PresenceMeta[]) => void;
  /** `detail` carries the server's reason when the connection fails. */
  onStatus: (status: TransportStatus, detail?: string) => void;
}

export interface Transport {
  join(room: string, meta: PresenceMeta, handlers: TransportHandlers): void;
  send(event: string, payload: unknown): void;
  leave(): void;
}

/** Message names used on the wire. */
export const EVENTS = ['lobby', 'state', 'action', 'hello', 'bye'] as const;
export type EventName = (typeof EVENTS)[number];

export type TransportKind = 'supabase' | 'local';

/**
 * Supabase credentials: our own VITE_ names, or the ones the Vercel ↔ Supabase
 * integration sets automatically.
 */
function supabaseConfig(): { url: string; key: string } | null {
  const env = import.meta.env;
  const url = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  // The newer publishable key first: projects can have their legacy anon key disabled.
  const key =
    env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? { url, key } : null;
}

/** Which transport this build can use, or null when online play is not configured. */
export function transportKind(): TransportKind | null {
  const env = import.meta.env;
  if (env.VITE_ONLINE_TRANSPORT === 'local') return 'local';
  if (supabaseConfig()) return 'supabase';
  return env.DEV ? 'local' : null;
}

export async function createTransport(): Promise<Transport> {
  const kind = transportKind();
  if (kind === 'supabase') {
    const { SupabaseTransport } = await import('./supabaseTransport');
    const cfg = supabaseConfig()!;
    return new SupabaseTransport(cfg.url, cfg.key);
  }
  if (kind === 'local') {
    const { LocalTransport } = await import('./localTransport');
    return new LocalTransport();
  }
  throw new Error('Online play is not configured');
}
