/**
 * Tiny synthesised sound effects (Web Audio). No audio files, so nothing to
 * download or cache. iOS only allows audio after a user gesture: `unlock()`
 * is called from the first tap.
 */
export type SoundName = 'deal' | 'play' | 'capture' | 'scopa' | 'select' | 'win' | 'lose' | 'turn';

let ctx: AudioContext | null = null;
let enabled = true;

function getCtx(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

export function setSoundEnabled(on: boolean): void {
  enabled = on;
}

export function unlockAudio(): void {
  const c = getCtx();
  if (c && c.state === 'suspended') void c.resume().catch(() => undefined);
}

function tone(c: AudioContext, freq: number, start: number, dur: number, type: OscillatorType, gain: number): void {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g).connect(c.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

/** A short filtered noise burst: the "flick" of a card. */
function flick(c: AudioContext, start: number, dur: number, freq: number, gain: number): void {
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = 0.9;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(c.destination);
  src.start(start);
}

export function playSound(name: SoundName): void {
  if (!enabled) return;
  const c = getCtx();
  if (!c || c.state !== 'running') return;
  const t = c.currentTime + 0.01;
  try {
    switch (name) {
      case 'select':
        flick(c, t, 0.04, 3200, 0.12);
        break;
      case 'play':
        flick(c, t, 0.09, 1800, 0.35);
        tone(c, 150, t, 0.07, 'sine', 0.12);
        break;
      case 'deal':
        for (let i = 0; i < 10; i++) flick(c, t + i * 0.14, 0.06, 2400 + (i % 3) * 300, 0.16);
        break;
      case 'capture':
        flick(c, t, 0.07, 1500, 0.3);
        flick(c, t + 0.09, 0.1, 900, 0.3);
        tone(c, 520, t + 0.05, 0.16, 'triangle', 0.08);
        break;
      case 'scopa':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, f, t + i * 0.09, 0.32, 'triangle', 0.16));
        flick(c, t, 0.25, 1200, 0.25);
        break;
      case 'turn':
        tone(c, 880, t, 0.12, 'sine', 0.06);
        break;
      case 'win':
        [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(c, f, t + i * 0.13, 0.5, 'triangle', 0.16));
        break;
      case 'lose':
        [392, 349.23, 293.66, 261.63].forEach((f, i) => tone(c, f, t + i * 0.18, 0.45, 'sine', 0.12));
        break;
    }
  } catch {
    /* audio is a nicety; never let it break the game */
  }
}
