/** Small path-data helpers shared by the card drawings. All output is plain SVG path data. */

export type Pt = readonly [number, number];

/** Round to 2 decimals so generated path data stays compact. */
export const n2 = (v: number): number => Math.round(v * 100) / 100;

const rad = (deg: number): number => (deg * Math.PI) / 180;

export function polar(r: number, deg: number, cx = 0, cy = 0): Pt {
  return [n2(cx + r * Math.cos(rad(deg))), n2(cy + r * Math.sin(rad(deg)))];
}

/** Closed star / rayed polygon with `points` tips. */
export function starPath(points: number, outer: number, inner: number, rot = -90, cx = 0, cy = 0): string {
  let d = '';
  for (let i = 0; i < points * 2; i++) {
    const [x, y] = polar(i % 2 === 0 ? outer : inner, rot + (i * 180) / points, cx, cy);
    d += `${i === 0 ? 'M' : 'L'}${x} ${y}`;
  }
  return `${d}Z`;
}

/** Closed scalloped (lobed) circle. */
export function scallopPath(lobes: number, radius: number, bulge: number, cx = 0, cy = 0): string {
  let d = '';
  for (let i = 0; i <= lobes; i++) {
    const [x, y] = polar(radius, -90 + (i * 360) / lobes, cx, cy);
    d += i === 0 ? `M${x} ${y}` : `A${bulge} ${bulge} 0 0 1 ${x} ${y}`;
  }
  return `${d}Z`;
}

/** `count` pointed petals radiating from the centre. */
export function petalsPath(count: number, length: number, spread: number, rot = -90, cx = 0, cy = 0, inner = 0): string {
  let d = '';
  for (let i = 0; i < count; i++) {
    const a = rot + (i * 360) / count;
    const [sx, sy] = polar(inner, a, cx, cy);
    const [tx, ty] = polar(length, a, cx, cy);
    const [ax, ay] = polar(length * 0.62, a - spread, cx, cy);
    const [bx, by] = polar(length * 0.62, a + spread, cx, cy);
    d += `M${sx} ${sy}Q${ax} ${ay} ${tx} ${ty}Q${bx} ${by} ${sx} ${sy}Z`;
  }
  return d;
}

/** A full circle as path data (so many dots can share one <path>). */
export function circlePath(cx: number, cy: number, r: number): string {
  return `M${n2(cx - r)} ${n2(cy)}a${r} ${r} 0 1 0 ${n2(r * 2)} 0a${r} ${r} 0 1 0 ${n2(-r * 2)} 0Z`;
}

export function dotsPath(pts: readonly Pt[], r: number): string {
  return pts.map(([x, y]) => circlePath(x, y, r)).join('');
}

/** Dots evenly spaced on a ring. */
export function ringDotsPath(count: number, radius: number, r: number, rot = -90, cx = 0, cy = 0): string {
  const pts: Pt[] = [];
  for (let i = 0; i < count; i++) pts.push(polar(radius, rot + (i * 360) / count, cx, cy));
  return dotsPath(pts, r);
}

/** Lens-shaped leaf from (x,y) pointing along `deg`. */
export function leafPath(x: number, y: number, deg: number, length: number, width: number): string {
  const [tx, ty] = polar(length, deg, x, y);
  const [ax, ay] = polar(Math.hypot(length / 2, width), deg - (Math.atan2(width, length / 2) * 180) / Math.PI, x, y);
  const [bx, by] = polar(Math.hypot(length / 2, width), deg + (Math.atan2(width, length / 2) * 180) / Math.PI, x, y);
  return `M${n2(x)} ${n2(y)}Q${ax} ${ay} ${tx} ${ty}Q${bx} ${by} ${n2(x)} ${n2(y)}Z`;
}

/** Leaves laid along a circular arc (a laurel branch). */
export function laurelPath(cx: number, cy: number, radius: number, from: number, to: number, count: number, length: number, width: number): string {
  let d = '';
  const dir = to > from ? 1 : -1;
  for (let i = 0; i < count; i++) {
    const a = from + ((to - from) * i) / (count - 1);
    const [x, y] = polar(radius, a, cx, cy);
    const tangent = a + 90 * dir;
    d += leafPath(x, y, tangent - 38 * dir, length, width) + leafPath(x, y, tangent + 38 * dir, length, width);
  }
  return d;
}
