/**
 * Pure geometry for the game board: given the board size and the state to
 * show, where does every card go? Kept free of React so it is easy to reason
 * about (and to test).
 */
import { HIDDEN, rankOf, suitIndexOf, teamOf, type CardId, type MatchState } from '../../engine';
import type { CaptureAnim } from '../../game/types';

export interface Geometry {
  W: number;
  H: number;
  /** Unscaled card size. */
  cw: number;
  ch: number;
  /** Scale of the cards held by the other three players. */
  otherScale: number;
  pileScale: number;
  /** Table area. */
  table: { x: number; y: number; w: number; h: number };
  /** Centre of each relative seat's hand: 0 bottom, 1 right, 2 top, 3 left. */
  seat: { x: number; y: number }[];
  /** Centre of the capture pile: [perspective team, other team]. */
  pile: { x: number; y: number }[];
  handY: number;
  /** Height reserved at the bottom for the hand (incl. the raise of a selected card). */
  handZone: number;
  actionH: number;
}

export interface Pose {
  x: number;
  y: number;
  rot: number;
  scale: number;
}

export interface Sprite extends Pose {
  key: string;
  card: CardId;
  faceUp: boolean;
  z: number;
  zone: 'hand' | 'other' | 'table' | 'play' | 'pile';
  /** Starting pose + delay, applied once when the sprite first appears. */
  fly?: Pose & { delay: number };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** `reserve` keeps extra room free just above the action bar (tutorial coach). */
export function computeGeometry(W: number, H: number, reserve = 0): Geometry {
  let cw = clamp(W * 0.2, 52, 100);
  // On short screens the hand may not eat more than ~23% of the height.
  cw = Math.min(cw, (H * 0.235) / 1.7);
  const ch = cw * 1.7;
  const otherScale = 0.4;
  const pileScale = 0.4;
  const side = ch * otherScale + 12;
  const top = ch * otherScale + 34;
  const actionH = 52;
  const raise = 20;
  const handZone = ch + 16 + raise;
  const handY = H - 16 - ch / 2;
  const table = { x: side, y: top, w: W - side * 2, h: Math.max(60, H - handZone - actionH - top - 6 - reserve) };
  const midY = table.y + table.h / 2;
  return {
    W,
    H,
    cw,
    ch,
    otherScale,
    pileScale,
    table,
    seat: [
      { x: W / 2, y: handY },
      { x: W - 6 - (ch * otherScale) / 2, y: midY },
      { x: W / 2, y: 6 + (ch * otherScale) / 2 },
      { x: 6 + (ch * otherScale) / 2, y: midY },
    ],
    pile: [
      // ours: at the right end of the action row, next to our hand
      { x: W - 8 - (cw * pileScale) / 2, y: H - handZone - actionH / 2 },
      { x: 8 + (cw * pileScale) / 2, y: 6 + (ch * pileScale) / 2 },
    ],
    handY,
    handZone,
    actionH,
  };
}

/** Centre positions and scale for `n` cards laid out on the table. */
export function tableSlots(n: number, g: Geometry): { poses: Pose[]; scale: number } {
  if (n === 0) return { poses: [], scale: 0.74 };
  const gap = 5;
  const { table } = g;
  let best = { scale: 0.3, cols: Math.max(1, n), rows: 1 };
  for (let s = n <= 4 ? 0.84 : 0.76; s >= 0.3; s -= 0.02) {
    const w = g.cw * s;
    const h = g.ch * s;
    const cols = Math.max(1, Math.min(n, Math.floor((table.w + gap) / (w + gap))));
    const rows = Math.ceil(n / cols);
    if (rows * (h + gap) - gap <= table.h) {
      best = { scale: s, cols, rows };
      break;
    }
  }
  const w = g.cw * best.scale;
  const h = g.ch * best.scale;
  const rows = best.rows;
  // Balance the rows (e.g. 7 cards -> 4 + 3 rather than 5 + 2).
  const cols = Math.ceil(n / rows);
  const totalH = rows * (h + gap) - gap;
  const y0 = table.y + (table.h - totalH) / 2 + h / 2;
  const poses: Pose[] = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / cols);
    const inRow = row === rows - 1 ? n - cols * (rows - 1) : cols;
    const col = i - row * cols;
    const totalW = inRow * (w + gap) - gap;
    poses.push({
      x: table.x + (table.w - totalW) / 2 + w / 2 + col * (w + gap),
      y: y0 + row * (h + gap),
      rot: 0,
      scale: best.scale,
    });
  }
  return { poses, scale: best.scale };
}

/** Display order of a hand: by value, then suit. */
export function sortHand(cards: readonly CardId[]): CardId[] {
  return [...cards].sort((a, b) => rankOf(a) - rankOf(b) || suitIndexOf(a) - suitIndexOf(b));
}

function bottomHandPose(i: number, n: number, g: Geometry, raised: boolean): Pose {
  const step = n > 1 ? Math.min(g.cw + 6, (g.W - 20 - g.cw) / (n - 1)) : 0;
  const total = g.cw + step * (n - 1);
  const mid = (n - 1) / 2;
  const d = i - mid;
  return {
    x: (g.W - total) / 2 + g.cw / 2 + i * step,
    y: g.handY + d * d * 0.32 - (raised ? 20 : 0),
    rot: d * 1.1,
    scale: 1,
  };
}

function otherHandPose(rel: number, i: number, n: number, g: Geometry): Pose {
  const c = g.seat[rel]!;
  const d = i - (n - 1) / 2;
  if (rel === 2) return { x: c.x + d * Math.min(12, (g.W * 0.45) / Math.max(1, n)), y: c.y, rot: 180, scale: g.otherScale };
  const step = Math.min(8.5, (g.table.h * 0.5) / Math.max(1, n));
  return { x: c.x, y: c.y + d * step * (rel === 1 ? -1 : 1), rot: rel === 1 ? -90 : 90, scale: g.otherScale };
}

export interface LayoutInput {
  view: MatchState;
  anim: CaptureAnim | null;
  perspective: number;
  g: Geometry;
  selected: CardId | null;
  /** True while the deal animation should be applied to newly mounted cards. */
  dealing: boolean;
}

export function computeSprites({ view, anim, perspective, g, selected, dealing }: LayoutInput): Sprite[] {
  const hand = view.hand;
  const prefix = `${view.handNumber}:`;
  const sprites: Sprite[] = [];
  const rel = (seat: number) => (seat - perspective + 4) & 3;
  const dealerPose: Pose = { ...g.seat[rel(hand.dealer)]!, rot: 0, scale: g.otherScale };
  const perHand = Math.max(...hand.hands.map((h) => h.length), 1);
  const dealDelay = (seat: number, i: number) => (i * 4 + ((seat - hand.dealer + 3) & 3)) * 32;
  const seatCentre = (seat: number): Pose => ({
    ...g.seat[rel(seat)]!,
    rot: rel(seat) === 1 ? -90 : rel(seat) === 3 ? 90 : 0,
    scale: rel(seat) === 0 ? 1 : g.otherScale,
  });

  const playing = anim?.move ?? null;

  // --- hands
  for (let seat = 0; seat < 4; seat++) {
    const r = rel(seat);
    let cards = hand.hands[seat]!;
    const known = cards.length > 0 && cards[0] !== HIDDEN;
    if (playing && playing.seat === seat) {
      // The card being played is drawn separately, on the table.
      cards = known ? cards.filter((c) => c !== playing.card) : cards.slice(1);
    }
    const order = known && r === 0 ? sortHand(cards) : cards;
    // Keep the fan's shape while a card is in flight from a visible hand.
    const n = order.length;
    order.forEach((card, i) => {
      const pose = r === 0 ? bottomHandPose(i, n, g, card === selected && card !== HIDDEN) : otherHandPose(r, i, n, g);
      sprites.push({
        ...pose,
        key: card === HIDDEN ? `${prefix}h${seat}:${i}` : `${prefix}${card}`,
        card,
        faceUp: card !== HIDDEN && r === 0,
        z: (r === 0 ? 100 : 20) + i,
        zone: r === 0 ? 'hand' : 'other',
        fly: dealing ? { ...dealerPose, delay: dealDelay(seat, i) } : undefined,
      });
    });
  }

  // --- table
  const slots = tableSlots(hand.table.length, g);
  const last = hand.history.length > 0 ? hand.history[hand.history.length - 1]! : null;
  hand.table.forEach((card, i) => {
    const pose = slots.poses[i]!;
    let fly: Sprite['fly'];
    if (dealing && hand.initialTable.includes(card)) {
      fly = { ...dealerPose, delay: perHand * 4 * 32 + i * 60 };
    } else if (last && last.card === card && (rel(last.seat) !== 0 || hand.hands[last.seat]![0] === HIDDEN)) {
      // Laid down by a player whose hand is face down: it flies in from their seat.
      fly = { ...seatCentre(last.seat), delay: 0 };
    }
    sprites.push({ ...pose, key: `${prefix}${card}`, card, faceUp: true, z: 40 + i, zone: 'table', fly });
  });

  // --- the card being played onto a capture
  if (playing) {
    const target = hand.table.indexOf(playing.captured[0]!);
    const base = target >= 0 ? slots.poses[target]! : { x: g.W / 2, y: g.table.y + g.table.h / 2, rot: 0, scale: slots.scale };
    const moverVisible = hand.hands[playing.seat]!.includes(playing.card);
    sprites.push({
      x: base.x + g.cw * base.scale * 0.3,
      y: base.y + g.ch * base.scale * 0.2,
      rot: 6,
      scale: base.scale * 1.04,
      key: `${prefix}${playing.card}`,
      card: playing.card,
      faceUp: true,
      z: 300,
      zone: 'play',
      fly: moverVisible ? undefined : { ...seatCentre(playing.seat), delay: 0 },
    });
  }

  // --- cards on their way into a pile (most recent capture, and the leftovers at the end)
  const toPile = (card: CardId, team: number, i: number) => {
    const p = g.pile[team === teamOf(perspective) ? 0 : 1]!;
    sprites.push({
      x: p.x,
      y: p.y,
      rot: 0,
      scale: g.pileScale,
      key: `${prefix}${card}`,
      card,
      faceUp: true,
      z: 5 + i,
      zone: 'pile',
    });
  };
  if (!playing && last && last.captured.length > 0) {
    const team = teamOf(last.seat);
    [...last.captured, last.card].forEach((c, i) => toPile(c, team, i));
  }
  if (hand.done && hand.leftover && hand.leftover.team !== null) {
    const skip = last && last.captured.length > 0 ? [...last.captured, last.card] : [];
    hand.leftover.cards.filter((c) => !skip.includes(c)).forEach((c, i) => toPile(c, hand.leftover!.team!, i));
  }
  return sprites;
}
