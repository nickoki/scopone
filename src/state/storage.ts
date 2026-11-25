/**
 * localStorage wrapped in try/catch: private mode, a full disk or a blocked
 * storage must never crash the game — it just means nothing is remembered.
 */
export function loadJson<T>(key: string): T | null {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveJson(key: string, value: unknown): boolean {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string): void {
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    /* ignore */
  }
}

export const KEYS = {
  settings: 'scopone.settings.v1',
  localGame: 'scopone.game.v1',
  identity: 'scopone.identity.v1',
  hostRoom: 'scopone.host.v1',
  guestRoom: 'scopone.guest.v1',
  reviews: 'scopone.reviews.v1',
} as const;
