import type { ReactNode } from 'react';
import type { CardStyle, Theme } from './themes';
import { THEMES } from './themes';
import { dotsPath, n2, petalsPath, starPath } from './geom';
import type { Pt } from './geom';

/*
 * Card backs. Each repeating pattern is generated once as path data (a couple
 * of <path> nodes per back, no <pattern> / ids) and every design is unchanged
 * by a 180 degree turn, so a face-down card never gives away its orientation.
 * The field is the rectangle 5..95 x 5..165.
 */

/** Diagonal lattice with a little lozenge in every cell. */
function napoletaneBack(t: Theme): ReactNode {
  let lines = '';
  for (let c = -160; c <= 260; c += 20) {
    // x + (y - 5) = c
    const x0 = Math.max(5, c - 160);
    const x1 = Math.min(95, c);
    if (x1 > x0) lines += `M${x0} ${c - x0 + 5}L${x1} ${c - x1 + 5}`;
    // x - (y - 5) = c
    const u0 = Math.max(5, c);
    const u1 = Math.min(95, c + 160);
    if (u1 > u0) lines += `M${u0} ${u0 - c + 5}L${u1} ${u1 - c + 5}`;
  }
  let lozenges = '';
  for (let p = 1; p <= 9; p++) {
    for (let q = 1; q <= 15; q++) {
      if ((p + q) % 2 === 0) continue;
      const x = p * 10;
      const y = 5 + q * 10;
      if (Math.abs(x - 50) < 18 && Math.abs(y - 85) < 18) continue;
      lozenges += `M${x} ${y - 3.4}L${x + 3.4} ${y}L${x} ${y + 3.4}L${x - 3.4} ${y}Z`;
    }
  }
  const b = t.back;
  return (
    <>
      <rect x={5} y={5} width={90} height={160} rx={4} fill={b.field} />
      <path d={lines} fill="none" stroke={b.motif} strokeWidth={0.9} opacity={0.85} />
      <path d={lozenges} fill={b.accent} />
      <rect x={5} y={5} width={90} height={160} rx={4} fill="none" stroke={b.fieldDeep} strokeWidth={1.6} />
      <circle cx={50} cy={85} r={17} fill={b.motif} stroke={b.fieldDeep} strokeWidth={1.4} />
      <circle cx={50} cy={85} r={13.4} fill={b.field} />
      <path d={petalsPath(8, 11.6, 26, -90, 50, 85)} fill={b.motif} />
      <circle cx={50} cy={85} r={3.4} fill={b.accent} stroke={b.fieldDeep} strokeWidth={0.9} />
    </>
  );
}

/** Square tiles, each holding a four-pointed star, with studs on the corners. */
function piacentineBack(t: Theme): ReactNode {
  let stars = '';
  const studs: Pt[] = [];
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 10; j++) {
      const x = 12.5 + i * 15;
      const y = 13 + j * 16;
      if (Math.abs(x - 50) < 16 && Math.abs(y - 85) < 17) continue;
      stars += starPath(4, 6.2, 2.1, -90, x, y);
    }
  }
  for (let i = 1; i < 6; i++) {
    for (let j = 1; j < 10; j++) {
      const x = 5 + i * 15;
      const y = 5 + j * 16;
      if (Math.abs(x - 50) < 16 && Math.abs(y - 85) < 17) continue;
      studs.push([x, y]);
    }
  }
  const b = t.back;
  return (
    <>
      <rect x={5} y={5} width={90} height={160} rx={4} fill={b.field} />
      <path d={stars} fill={b.motif} />
      <path d={dotsPath(studs, 1.5)} fill={b.accent} />
      <rect x={7.6} y={7.6} width={84.8} height={154.8} rx={2.4} fill="none" stroke={b.motif} strokeWidth={0.8} />
      <rect x={5} y={5} width={90} height={160} rx={4} fill="none" stroke={b.fieldDeep} strokeWidth={1.6} />
      <path d={starPath(4, 21, 13, -90, 50, 85)} fill={b.motif} stroke={b.fieldDeep} strokeWidth={1.3} strokeLinejoin="round" />
      <path d={starPath(4, 13.6, 5, -90, 50, 85)} fill={b.field} />
      <path d={starPath(4, 9, 3.2, -45, 50, 85)} fill={b.accent} />
    </>
  );
}

/** Folk zigzag bands in two colours around a little sun. */
function sicilianeBack(t: Theme): ReactNode {
  const band = (y: number): string => {
    let d = '';
    for (let k = 0; k <= 13; k++) d += `${k === 0 ? 'M' : 'L'}${n2(11 + k * 6)} ${y + (k % 2 === 0 ? 2.8 : -2.8)}`;
    return d;
  };
  let a = '';
  let c = '';
  for (let j = 0; j < 15; j++) {
    const y = 15 + j * 10;
    if (j % 2 === 0) a += band(y);
    else c += band(y);
  }
  const b = t.back;
  return (
    <>
      <rect x={5} y={5} width={90} height={160} rx={4} fill={b.field} />
      <path d={a} fill="none" stroke={b.motif} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
      <path d={c} fill="none" stroke={b.accent} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
      <rect x={5} y={5} width={90} height={160} rx={4} fill="none" stroke={b.fieldDeep} strokeWidth={1.6} />
      <circle cx={50} cy={85} r={22} fill={b.field} stroke={b.fieldDeep} strokeWidth={1.4} />
      <path d={starPath(16, 19, 12.4, -90, 50, 85)} fill={b.motif} stroke={b.fieldDeep} strokeWidth={1} strokeLinejoin="round" />
      <circle cx={50} cy={85} r={8.4} fill={b.accent} stroke={b.fieldDeep} strokeWidth={1} />
      <circle cx={50} cy={85} r={3.2} fill={b.motif} />
    </>
  );
}

const cache = new Map<CardStyle, ReactNode>();

export function backArt(style: CardStyle): ReactNode {
  let art = cache.get(style);
  if (art === undefined) {
    const t = THEMES[style];
    art = style === 'piacentine' ? piacentineBack(t) : style === 'siciliane' ? sicilianeBack(t) : napoletaneBack(t);
    cache.set(style, art);
  }
  return art;
}
