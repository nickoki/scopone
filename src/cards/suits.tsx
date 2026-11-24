import type { ReactNode } from 'react';
import type { Suit } from '../engine/cards';
import type { Theme } from './themes';
import { n2, petalsPath, ringDotsPath, scallopPath, starPath, dotsPath } from './geom';

/**
 * Suit symbols. Each one is drawn around the origin in its own unit box
 * (coins: radius 10, cups: 20 tall, swords and clubs: 100 long, pointing up)
 * and then placed with a transform, so the same drawing serves pips, aces,
 * court cards and UI icons.
 */
const UNIT: Record<Suit, number> = { denari: 20, coppe: 20, spade: 100, bastoni: 100 };

type Draw = (t: Theme, w: number, rich: boolean) => ReactNode;

/* ------------------------------------------------------------------ coins */

const NAP_SCALLOP = scallopPath(12, 8.8, 2.5);
const NAP_PETALS = petalsPath(8, 6.2, 27);
const NAP_PETALS_IN = petalsPath(8, 3.7, 30, -67.5);
const NAP_LOBE_DOTS = ringDotsPath(12, 8.75, 0.62, -75);
const PIA_STAR = starPath(8, 5.6, 2.4);
const PIA_RING_DOTS = ringDotsPath(16, 6.55, 0.42);
const SIC_RAYS = starPath(12, 10, 7.1);
const SIC_RAYS_RICH = starPath(24, 7.9, 6.4);
const SIC_PETALS = petalsPath(6, 3.9, 34);

const coin: Draw = (t, w, rich) => {
  switch (t.id) {
    case 'piacentine':
      return (
        <>
          <circle r={9.5} fill={t.gold} />
          <circle r={7.4} fill={t.blue} strokeWidth={n2(w * 0.7)} />
          {rich && <path d={PIA_RING_DOTS} fill={t.yellow} stroke="none" />}
          <circle r={5.7} fill={t.white} strokeWidth={n2(w * 0.7)} />
          <path d={PIA_STAR} fill={t.red} strokeWidth={n2(w * 0.45)} />
          <circle r={1.5} fill={t.yellow} strokeWidth={n2(w * 0.5)} />
        </>
      );
    case 'siciliane':
      return (
        <>
          <path d={SIC_RAYS} fill={t.gold} />
          {rich && <path d={SIC_RAYS_RICH} fill={t.green} strokeWidth={n2(w * 0.6)} />}
          <circle r={6.6} fill={t.yellow} />
          <circle r={4.2} fill="none" stroke={t.red} strokeWidth={1.6} />
          {rich && <path d={SIC_PETALS} fill={t.red} strokeWidth={n2(w * 0.5)} />}
          <circle r={1.8} fill={rich ? t.yellow : t.green} strokeWidth={n2(w * 0.6)} />
        </>
      );
    default:
      return (
        <>
          <path d={NAP_SCALLOP} fill={t.gold} />
          {rich && <path d={NAP_LOBE_DOTS} fill={t.red} stroke="none" />}
          <circle r={6.7} fill={t.yellow} strokeWidth={n2(w * 0.8)} />
          <path d={NAP_PETALS} fill={t.red} strokeWidth={n2(w * 0.45)} />
          {rich && <path d={NAP_PETALS_IN} fill={t.blue} strokeWidth={n2(w * 0.4)} />}
          <circle r={1.9} fill={t.gold} strokeWidth={n2(w * 0.7)} />
        </>
      );
  }
};

/* ------------------------------------------------------------------- cups */

const NAP_BOWL_DOTS = dotsPath(
  [
    [-4.4, -3.7],
    [-2.2, -3.4],
    [0, -3.3],
    [2.2, -3.4],
    [4.4, -3.7],
  ],
  0.62,
);

const cup: Draw = (t, w, rich) => {
  switch (t.id) {
    case 'piacentine':
      return (
        <>
          <path d="M-6.2 10L-3 6.4H3L6.2 10Z" fill={t.yellow} />
          <path d="M-1.3 2H1.3V6.6H-1.3Z" fill={t.yellow} strokeWidth={n2(w * 0.7)} />
          <path d="M0 2.6L2.7 4.4L0 6.2L-2.7 4.4Z" fill={t.blue} strokeWidth={n2(w * 0.7)} />
          <path d="M-7.6 -9.4H7.6L5.4 -2L2.3 2.4H-2.3L-5.4 -2Z" fill={t.red} />
          <path d="M-5.4 -2H5.4L2.3 2.4H-2.3Z" fill={t.blue} strokeWidth={n2(w * 0.7)} />
          <path d="M-7.6 -9.4H7.6L6.8 -6.5H-6.8Z" fill={t.yellow} strokeWidth={n2(w * 0.7)} />
          {rich && (
            <path d="M-4.6 -6.5L-3.4 -2M0 -6.5V-2M4.6 -6.5L3.4 -2" fill="none" stroke={t.yellow} strokeWidth={0.5} />
          )}
        </>
      );
    case 'siciliane':
      return (
        <>
          <path
            d="M-5.6 -6.6C-11 -8.6 -11 0.4 -4.4 -0.8M5.6 -6.6C11 -8.6 11 0.4 4.4 -0.8"
            fill="none"
            strokeWidth={n2(1.3 + w * 1.5)}
            strokeLinecap="round"
          />
          <path
            d="M-5.6 -6.6C-11 -8.6 -11 0.4 -4.4 -0.8M5.6 -6.6C11 -8.6 11 0.4 4.4 -0.8"
            fill="none"
            stroke={t.yellow}
            strokeWidth={1.3}
            strokeLinecap="round"
          />
          <path d="M-1.1 2.6H1.1L1.6 6.8C4 7.2 5.6 8.3 5.6 10H-5.6C-5.6 8.3 -4 7.2 -1.6 6.8Z" fill={t.green} />
          <path d="M-6.5 -8.2C-6.5 0 -3.8 3.2 0 3.2C3.8 3.2 6.5 0 6.5 -8.2Z" fill={t.red} />
          <path d="M-6 -3.6Q0 -1.5 6 -3.6" fill="none" stroke={t.yellow} strokeWidth={1.4} />
          <ellipse cy={-8.2} rx={6.5} ry={1.7} fill={t.yellow} />
          {rich && <path d={dotsPath([[-3, -5.6], [0, -5.2], [3, -5.6]], 0.6)} fill={t.green} stroke="none" />}
        </>
      );
    default:
      return (
        <>
          <path d="M-6 10C-6 7.5 -2 7.9 -1.3 6.2H1.3C2 7.9 6 7.5 6 10Z" fill={t.gold} />
          <circle cy={4.9} r={1.9} fill={t.blue} strokeWidth={n2(w * 0.8)} />
          <path d="M-7.2 -7.6C-7.2 -1 -5 3.2 0 3.2C5 3.2 7.2 -1 7.2 -7.6Z" fill={t.red} />
          <path d="M-6.05 -1.2C-4.7 2 -2.6 3.2 0 3.2C2.6 3.2 4.7 2 6.05 -1.2Q0 0.6 -6.05 -1.2Z" fill={t.gold} strokeWidth={n2(w * 0.7)} />
          {rich && <path d={NAP_BOWL_DOTS} fill={t.yellow} stroke="none" />}
          <rect x={-7.7} y={-9.7} width={15.4} height={3} rx={1.1} fill={t.gold} />
        </>
      );
  }
};

/* ----------------------------------------------------------------- swords */

const sword: Draw = (t) => {
  switch (t.id) {
    case 'piacentine':
      return (
        <>
          <path d="M0 -50L7 -30L5.6 20H-5.6L-7 -30Z" fill={t.blueLight} />
          <path d="M0 -43L2.9 -29L2.3 17H-2.3L-2.9 -29Z" fill={t.blue} stroke="none" />
          <path d="M-18 19H18V25.5H-18Z" fill={t.yellow} />
          <path d="M-3.9 25.5H3.9V38H-3.9Z" fill={t.red} />
          <path d="M0 36L6.6 43L0 50L-6.6 43Z" fill={t.yellow} />
        </>
      );
    case 'siciliane':
      return (
        <>
          <path d="M0 -50C10 -38 9 -26 6.6 19H-6.6C-9 -26 -10 -38 0 -50Z" fill={t.blueLight} />
          <path d="M0 -40V15" fill="none" stroke={t.blue} strokeWidth={3.2} strokeLinecap="round" />
          <path d="M-18 13C-11 21.5 11 21.5 18 13L16.6 22.6C10 29 -10 29 -16.6 22.6Z" fill={t.yellow} />
          <rect x={-4} y={26.4} width={8} height={13.6} fill={t.green} />
          <circle cy={44.2} r={5.8} fill={t.red} />
        </>
      );
    default:
      return (
        <>
          <path d="M0 -50L7 -38V20H-7V-38Z" fill={t.blueLight} />
          <path d="M0 -46.4L5.4 -37.2V18.6H0Z" fill={t.blue} stroke="none" />
          <rect x={-17} y={19} width={34} height={8.5} rx={4.2} fill={t.gold} />
          <rect x={-4.2} y={27.5} width={8.4} height={12.5} fill={t.red} />
          <circle cy={44.2} r={5.8} fill={t.gold} />
        </>
      );
  }
};

/* ------------------------------------------------------------------ clubs */

const club: Draw = (t, w) => {
  switch (t.id) {
    case 'piacentine':
      return (
        <>
          <path d="M7.4 -31L15 -39L7 -19ZM-6.4 -8L-13.6 -16L-5.8 4ZM5.4 14L12.4 6.6L4.8 25Z" fill={t.greenLight} />
          <path d="M-9 -46H9L5.2 47H-5.2Z" fill={t.green} />
          <path d="M-4.4 -36L-2 -26M3.4 -17L1.2 -7M-2.4 6L-0.6 16M2 27L0.8 36" fill="none" stroke={t.greenLight} strokeWidth={2} strokeLinecap="round" />
          <ellipse cy={-46} rx={9} ry={3.5} fill={t.yellow} />
          <ellipse cy={47} rx={5.2} ry={2.2} fill={t.red} strokeWidth={n2(w * 0.8)} />
        </>
      );
    case 'siciliane':
      return (
        <>
          <path d="M6.6 -9C14 -18 21 -11 17 -3C13 -1.4 9 -3.6 6.6 -9Z" fill={t.greenLight} />
          <path d="M0 -50C10.5 -50 12 -38 10 -27C8 -13 5.6 0 4.8 44C4.8 50 -4.8 50 -4.8 44C-5.6 0 -8 -13 -10 -27C-12 -38 -10.5 -50 0 -50Z" fill={t.green} />
          <path d="M-10.1 -29Q0 -25 10.1 -29M-6.2 3Q0 5.6 6.2 3" fill="none" stroke={t.yellow} strokeWidth={3} />
          <path d="M-4.9 39Q0 41.4 4.9 39L4.8 44C4.8 50 -4.8 50 -4.8 44Z" fill={t.red} strokeWidth={n2(w * 0.7)} />
          <circle cy={-42} r={3.2} fill={t.red} strokeWidth={n2(w * 0.7)} />
        </>
      );
    default:
      return (
        <>
          <path d="M-9.5 -44C-10.5 -38 -12.5 -32 -11 -27C-9.5 -22 -8.5 -16 -8 -8C-7.6 -2 -9.6 4 -8.6 9C-7.4 14 -6 22 -5.4 30L-4.6 46H4.6L5.2 34C5.6 30 8.4 28 7.8 23C7.2 16 7.4 6 7.8 -2C8.2 -6 11.6 -8 11 -13C10.4 -20 9.6 -32 9.5 -44Z" fill={t.green} />
          <path d="M-3.6 -37C-5.6 -28 -2.4 -20 -2.8 -10C-3 -2 -1.6 8 -1.2 28" fill="none" stroke={t.greenLight} strokeWidth={3} strokeLinecap="round" />
          <path d="M4.6 -33q2.2 2.8 0 5.6M5.4 -17q2 2.5 0 5M3.4 5q1.8 2.2 0 4.4M3 21q1.5 1.9 0 3.8" fill="none" strokeWidth={n2(w * 0.6)} strokeLinecap="round" />
          <ellipse cy={-44} rx={9.5} ry={4.2} fill={t.red} />
          <ellipse cy={46} rx={4.6} ry={2.2} fill={t.red} strokeWidth={n2(w * 0.8)} />
        </>
      );
  }
};

const DRAW: Record<Suit, Draw> = { denari: coin, coppe: cup, spade: sword, bastoni: club };

export interface SymbolOpts {
  rot?: number;
  /** Outline width in card units (defaults to the theme's pip line). */
  line?: number;
  /** Extra ornament, used for aces and showpiece cards. */
  rich?: boolean;
  key?: string | number;
}

/**
 * Draw one suit symbol centred on (x, y). `size` is the coin diameter, the
 * cup height, or the sword / club length, in card units.
 */
export function suitSymbol(suit: Suit, t: Theme, x: number, y: number, size: number, opts: SymbolOpts = {}): ReactNode {
  const s = size / UNIT[suit];
  const w = (opts.line ?? t.pipLine) / s;
  const rot = opts.rot ? ` rotate(${opts.rot})` : '';
  return (
    <g
      key={opts.key}
      transform={`translate(${n2(x)} ${n2(y)})${rot} scale(${n2(s)})`}
      stroke={t.ink}
      strokeWidth={n2(w)}
      strokeLinejoin="round"
    >
      {DRAW[suit](t, w, opts.rich ?? false)}
    </g>
  );
}

/** Bold little glyph for the corner index, about 11 units tall, centred on (x, y). */
export function miniSuit(suit: Suit, t: Theme, x: number, y: number): ReactNode {
  const tr = `translate(${x} ${y})`;
  switch (suit) {
    case 'denari':
      return (
        <g transform={tr} stroke={t.ink} strokeWidth={0.8}>
          <circle r={4.6} fill={t.gold} />
          <circle r={1.8} fill={t.red} strokeWidth={0.5} />
        </g>
      );
    case 'coppe':
      return (
        <path
          transform={tr}
          d="M-4.4 -5H4.4C4.4 -0.6 2.8 1.2 1 1.6V3.2H3.2V5H-3.2V3.2H-1V1.6C-2.8 1.2 -4.4 -0.6 -4.4 -5Z"
          fill={t.red}
          stroke={t.ink}
          strokeWidth={0.8}
          strokeLinejoin="round"
        />
      );
    case 'spade':
      return (
        <g transform={tr} stroke={t.ink} strokeWidth={0.7} strokeLinejoin="round">
          <path d="M0 -5.8L1.8 -3.4V1.4H-1.8V-3.4Z" fill={t.blue} />
          <path d="M-4 1.2H4V3H-4Z" fill={t.gold} />
          <path d="M-1 3H1V5.8H-1Z" fill={t.red} />
        </g>
      );
    default:
      return (
        <g transform={tr} stroke={t.ink} strokeWidth={0.7} strokeLinejoin="round">
          <path d="M-2.6 -5C-3.4 -2 -1.6 -1 -2 1.6L-1.5 5.6H1.5L2 1.6C1.6 -1 3.4 -2 2.6 -5Z" fill={t.green} />
          <ellipse cy={-5} rx={2.6} ry={1.1} fill={t.red} />
        </g>
      );
  }
}
