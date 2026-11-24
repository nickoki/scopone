/**
 * Small, fast, seedable PRNG (mulberry32). The whole state is one int32,
 * so it can be stored inside a serialised game and resumed exactly.
 */
export interface Rng {
  /** Current internal state (int32). Persist this to resume the stream. */
  state: number;
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, n). */
  int(n: number): number;
}

export function makeRng(seed: number): Rng {
  const rng: Rng = {
    state: seed | 0,
    next() {
      rng.state = (rng.state + 0x6d2b79f5) | 0;
      let t = rng.state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(n: number) {
      return Math.floor(rng.next() * n);
    },
  };
  return rng;
}

/** In-place Fisher–Yates shuffle. */
export function shuffle<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const tmp = items[i]!;
    items[i] = items[j]!;
    items[j] = tmp;
  }
  return items;
}

/** A fresh, non-deterministic seed for new games. */
export function randomSeed(): number {
  try {
    const buf = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buf);
    return buf[0]! | 0;
  } catch {
    return (Math.random() * 0xffffffff) | 0;
  }
}
