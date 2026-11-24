import type { ReactNode } from 'react';
import type { Suit } from '../engine/cards';
import type { Theme } from './themes';
import { dotsPath, n2, starPath } from './geom';
import { suitSymbol } from './suits';

export type Court = 'fante' | 'cavallo' | 're';

/** Colours worn by the court of one suit; they lean on the suit's own colour. */
interface Costume {
  main: string;
  alt: string;
  hoseL: string;
  hoseR: string;
  hat: string;
  plume: string;
  cloak: string;
  robe: string;
  hair: string;
  beard: string;
  horse: string;
  horseFar: string;
  mane: string;
  cloth: string;
}

function costume(t: Theme, suit: Suit): Costume {
  switch (suit) {
    case 'denari':
      return {
        main: t.yellow, alt: t.red, hoseL: t.red, hoseR: t.red, hat: t.red, plume: t.white,
        cloak: t.gold, robe: t.red, hair: t.brown, beard: '#f1ece0',
        horse: '#f6f0e4', horseFar: '#cfc5b2', mane: t.brown, cloth: t.red,
      };
    case 'coppe':
      return {
        main: t.red, alt: t.yellow, hoseL: t.blue, hoseR: t.yellow, hat: t.blue, plume: t.yellow,
        cloak: t.red, robe: t.blue, hair: '#3a2414', beard: '#3a2414',
        horse: '#c17a45', horseFar: '#93552a', mane: '#3a2414', cloth: t.yellow,
      };
    case 'spade':
      return {
        main: t.blue, alt: t.yellow, hoseL: t.red, hoseR: t.yellow, hat: t.red, plume: t.white,
        cloak: t.blue, robe: t.yellow, hair: t.brown, beard: t.brown,
        horse: '#b4bdc9', horseFar: '#858f9d', mane: '#2e3542', cloth: t.red,
      };
    default:
      return {
        main: t.green, alt: t.yellow, hoseL: t.red, hoseR: t.red, hat: t.yellow, plume: t.red,
        cloak: t.green, robe: t.red, hair: '#3a2414', beard: '#f1ece0',
        horse: '#ecd3a6', horseFar: '#c2a06c', mane: t.brown, cloth: t.green,
      };
  }
}

/** A rounded limb: an ink stroke with a narrower coloured stroke on top. */
function limb(d: string, color: string, width: number, lw: number): ReactNode {
  return (
    <>
      <path d={d} fill="none" strokeWidth={n2(width + lw * 2)} />
      <path d={d} fill="none" stroke={color} strokeWidth={width} />
    </>
  );
}

/** Several overlapping shapes fused into one outlined silhouette. */
function blob(d: string, color: string, lw: number): ReactNode {
  return (
    <>
      <path d={d} strokeWidth={n2(lw * 2)} />
      <path d={d} fill={color} stroke="none" />
    </>
  );
}

/* ------------------------------------------------------------------ heads */

const EYES = dotsPath([[-3.2, -0.8], [3.2, -0.8]], 1.05);
const CHEEKS = dotsPath([[-5, 2.9], [5, 2.9]], 1.7);
const HAIR = 'M-10.4 -1C-10.4 -9 -5 -11.2 0 -11.2C5 -11.2 10.4 -9 10.4 -1C10.4 5 9.6 8.6 7.4 10.6H-7.4C-9.6 8.6 -10.4 5 -10.4 -1Z';

function hat(t: Theme, c: Costume): ReactNode {
  switch (t.id) {
    case 'piacentine':
      return (
        <>
          <path d="M-9.6 -6.6C-13 -18 13 -18 9.6 -6.6Z" fill={c.hat} />
          <rect x={-11.6} y={-9.6} width={23.2} height={5} rx={2.4} fill={c.alt} />
          <path d="M0 -10.6L2.6 -7.1L0 -3.6L-2.6 -7.1Z" fill={t.white} strokeWidth={n2(t.figLine * 0.8)} />
        </>
      );
    case 'siciliane':
      return (
        <>
          <path d="M-5.5 -12C-9 -23 -19 -22 -18.5 -13.5C-15.5 -16.5 -11.5 -14.5 -9 -8Z" fill={c.plume} />
          <path d="M-7.8 -6.4C-7.8 -17 7.8 -17 7.8 -6.4Z" fill={c.hat} />
          <path d="M-14 -6.2C-14 -9.6 14 -9.6 14 -6.2C14 -2.9 -14 -2.9 -14 -6.2Z" fill={c.hat} />
          <path d="M-7.6 -8.3Q0 -10.4 7.6 -8.3" fill="none" stroke={t.yellow} strokeWidth={1.8} />
        </>
      );
    default:
      return (
        <>
          <path d="M-6.5 -13C-11 -24 -20 -25.5 -23 -21C-19 -20.4 -14.5 -15.4 -10 -9.5Z" fill={c.plume} />
          <path d="M-10.6 -5.2C-11.6 -14 -3 -18.4 4 -16.8C10 -15.6 12.8 -10 11.2 -5.2C5 -8.4 -5 -8.4 -10.6 -5.2Z" fill={c.hat} />
          <path d="M-10.6 -5.2C-5 -8.4 5 -8.4 11.2 -5.2L10.8 -2.6C5 -5.6 -5 -5.6 -10.3 -2.6Z" fill={t.gold} strokeWidth={n2(t.figLine * 0.8)} />
        </>
      );
  }
}

function crown(t: Theme, c: Costume): ReactNode {
  switch (t.id) {
    case 'piacentine':
      return (
        <>
          <path d="M-9.6 -12.6C-9 -23.4 9 -23.4 9.6 -12.6Z" fill={t.red} />
          <path d="M-9.6 -12.6C-6 -21 6 -21 9.6 -12.6M0 -12.6V-21" fill="none" stroke={t.yellow} strokeWidth={1.9} />
          <path d="M-10.6 -5.4H10.6L11.8 -13.4L7.4 -10.8L3.8 -14.6L0 -10.8L-3.8 -14.6L-7.4 -10.8L-11.8 -13.4Z" fill={t.yellow} />
          <path d="M-1.3 -25.4H1.3V-23.4H3.3V-21H-3.3V-23.4H-1.3Z" fill={t.yellow} strokeWidth={n2(t.figLine * 0.8)} />
        </>
      );
    case 'siciliane':
      return (
        <>
          <path d="M-10.8 -5.6L-13 -19.6L-5.2 -12L0 -23L5.2 -12L13 -19.6L10.8 -5.6Z" fill={t.yellow} />
          <path d="M-10.8 -5.6H10.8L11.4 -9.4H-11.4Z" fill={c.alt === t.yellow ? t.red : c.alt} strokeWidth={n2(t.figLine * 0.8)} />
          <path d={dotsPath([[-13, -20], [0, -23.6], [13, -20]], 2.1)} fill={t.red} strokeWidth={n2(t.figLine * 0.7)} />
        </>
      );
    default:
      return (
        <>
          <path d="M-10.4 -5.6L-12.4 -20.6L-6.2 -13.4L0 -24L6.2 -13.4L12.4 -20.6L10.4 -5.6Z" fill={t.gold} />
          <path d="M-10.4 -5.6H10.4L10.9 -9.4H-10.9Z" fill={t.red} strokeWidth={n2(t.figLine * 0.8)} />
          <path d={dotsPath([[-12.4, -21], [0, -24.6], [12.4, -21]], 1.7)} fill={t.red} strokeWidth={n2(t.figLine * 0.7)} />
        </>
      );
  }
}

/** Head with face centre at (cx, cy); it grows upward from the chin when the theme asks for bigger heads. */
function head(t: Theme, c: Costume, king: boolean, cx: number, cy: number): ReactNode {
  const s = t.headScale;
  return (
    <g transform={`translate(${cx} ${n2(cy + 9.2 * (1 - s))}) scale(${s})`}>
      <path d={HAIR} fill={king ? c.beard : c.hair} />
      <ellipse rx={8} ry={9.2} fill={t.skin} />
      {king && (
        <path
          d="M-8 -0.4C-8.6 9 -4 15.6 0 15.6C4 15.6 8.6 9 8 -0.4C6.4 4.6 3.4 6 0 4C-3.4 6 -6.4 4.6 -8 -0.4Z"
          fill={c.beard}
        />
      )}
      {t.id === 'siciliane' && <path d={CHEEKS} fill="#f08a6e" stroke="none" />}
      <path d={EYES} fill={t.ink} stroke="none" />
      <path
        d={king ? 'M0 -0.2L-0.9 2.4H0.6' : 'M0 -0.2L-0.9 2.4H0.6M-2.4 5Q0 6.6 2.4 5'}
        fill="none"
        strokeWidth={0.9}
      />
      {king ? crown(t, c) : hat(t, c)}
    </g>
  );
}

/* ------------------------------------------------------- the held symbol */

/** Front arm, hand and suit symbol for the standing figures (fante and re). */
function standingHold(t: Theme, suit: Suit, color: string, flourish: boolean, bust: boolean): ReactNode {
  const lw = t.figLine;
  const hand = (x: number, y: number): ReactNode => <circle cx={x} cy={y} r={3.4} fill={t.skin} />;
  switch (suit) {
    case 'denari':
      return (
        <>
          {limb('M58 51.5L68 62.5L73.5 52', color, t.limb, lw)}
          {hand(73.8, 50.5)}
          {flourish && <path d={starPath(12, 17.4, 13, -90, 75, 33.5)} fill={t.red} strokeWidth={n2(lw * 0.8)} />}
          {suitSymbol('denari', t, 75, 33.5, 27, { line: lw, rich: flourish })}
        </>
      );
    case 'coppe':
      return (
        <>
          {limb('M58 51.5L68 62.5L73.5 53', color, t.limb, lw)}
          {hand(73.8, 51.5)}
          {suitSymbol('coppe', t, 75, 32, 35, { line: lw })}
        </>
      );
    case 'spade':
      return (
        <>
          {limb('M58 51.5L65 66L72.5 73', color, t.limb, lw)}
          {suitSymbol('spade', t, 76.5, 46, 80, { line: lw, rot: 4 })}
          {hand(74.6, 73.6)}
        </>
      );
    default:
      return (
        <>
          {limb('M58 51.5L65 66L72.5 73', color, t.limb, lw)}
          {bust ? suitSymbol('bastoni', t, 78.5, 46, 70, { line: lw, rot: 5 }) : suitSymbol('bastoni', t, 76.5, 91, 122, { line: lw })}
          {hand(75.4, 73.6)}
        </>
      );
  }
}

/** Raised arm and symbol for the rider. */
function riderHold(t: Theme, suit: Suit, color: string): ReactNode {
  const lw = t.figLine;
  const hand = <circle cx={75} cy={57.5} r={3.2} fill={t.skin} />;
  const arm = limb('M59.5 65.5L69 70L74.5 59.5', color, t.limb - 0.6, lw);
  switch (suit) {
    case 'denari':
      return (
        <>
          {arm}
          {hand}
          {suitSymbol('denari', t, 78, 41.5, 25, { line: lw })}
        </>
      );
    case 'coppe':
      return (
        <>
          {arm}
          {hand}
          {suitSymbol('coppe', t, 77.5, 39.5, 32, { line: lw })}
        </>
      );
    case 'spade':
      return (
        <>
          {arm}
          {suitSymbol('spade', t, 78, 38, 60, { line: lw, rot: 9 })}
          {hand}
        </>
      );
    default:
      return (
        <>
          {arm}
          {suitSymbol('bastoni', t, 78, 37, 62, { line: lw, rot: 9 })}
          {hand}
        </>
      );
  }
}

/* ---------------------------------------------------------------- figures */

function ground(t: Theme): ReactNode {
  return <path d="M12 157.5C30 150.5 70 150.5 88 157.5Z" fill={t.greenLight} strokeWidth={n2(t.figLine * 0.8)} />;
}

/** Widens a standing body about its centre line (x = 46) for the stockier folk figures. */
function stretch(t: Theme, body: ReactNode): ReactNode {
  const k = t.figStretch;
  return k === 1 ? body : <g transform={`translate(${n2(46 * (1 - k))} 0) scale(${k} 1)`}>{body}</g>;
}

function fante(t: Theme, suit: Suit, c: Costume, bust: boolean): ReactNode {
  const lw = t.figLine;
  const folk = t.id === 'siciliane';
  return (
    <>
      {!bust && ground(t)}
      {stretch(
        t,
        <>
          {!bust && (
            <>
              {limb('M40 98L37.5 144.5', c.hoseL, t.limb + 1.2, lw)}
              {limb('M52 98L55.5 144.5', c.hoseR, t.limb + 1.2, lw)}
              {folk && (
                <path
                  d="M34.2 112h9.9M33.6 123h9.9M33 134h9.9M48.2 112h9.9M49 123h9.9M49.8 134h9.9"
                  fill="none"
                  stroke={t.white}
                  strokeWidth={3}
                  strokeLinecap="butt"
                />
              )}
              <path
                d="M32.6 143.6H42V152.6H25.6C25.6 148 28.6 144.6 32.6 143.6ZM51 143.6H60.4C64.4 144.6 67.4 148 67.4 152.6H51Z"
                fill={t.brown}
              />
            </>
          )}
          {limb('M34.5 51.5L26.5 63L32.6 71.6', c.alt, t.limb, lw)}
          <circle cx={33.4} cy={72.8} r={3.4} fill={t.skin} />
          <path d="M33 49.6C38 44.4 54 44.4 59 49.6L60.4 72C62.4 84 66 93 68.4 100.4C54 106.6 38 106.6 23.6 100.4C26 93 29.6 84 31.6 72Z" fill={c.main} />
          <path d="M23.6 100.4C38 106.6 54 106.6 68.4 100.4L66.8 95.6C54 101.4 38 101.4 25.2 95.6Z" fill={c.alt} strokeWidth={n2(lw * 0.8)} />
          <path d="M38.6 77.6L35.6 97.6M46 77.6V99.6M53.4 77.6L56.4 97.6M46 51V71" fill="none" strokeWidth={n2(lw * 0.6)} />
          {folk && <path d={dotsPath([[39.4, 57], [52.6, 57], [39.4, 65], [52.6, 65]], 1.7)} fill={c.alt} strokeWidth={n2(lw * 0.5)} />}
          <path d="M31.5 71H60.5L61.2 77.2H30.8Z" fill={t.gold} strokeWidth={n2(lw * 0.8)} />
          <path d="M39.4 45.4L46 53.4L52.6 45.4C50 43.6 42 43.6 39.4 45.4Z" fill={t.white} strokeWidth={n2(lw * 0.8)} />
          {head(t, c, false, 46, 33.6)}
        </>,
      )}
      {standingHold(t, suit, c.alt, false, bust)}
    </>
  );
}

function re(t: Theme, suit: Suit, c: Costume, bust: boolean): ReactNode {
  const lw = t.figLine;
  // The cropped bust drops the sceptre: it would sit under the corner index.
  const sceptre = !bust && (suit === 'denari' || suit === 'coppe');
  const folk = t.id === 'siciliane';
  return (
    <>
      {!bust && ground(t)}
      {stretch(
        t,
        <>
          {!bust && (
            <path d="M33.6 149H43.4V154.4H29.6C29.6 151.6 31 149.6 33.6 149ZM48.6 149H58.4C61 149.6 62.4 151.6 62.4 154.4H48.6Z" fill={t.redDeep} />
          )}
          <path d="M30 51C36 44.6 56 44.6 62 51C70 80 76 120 79.4 151H12.6C16 120 22 80 30 51Z" fill={c.cloak} />
          <path d="M38.6 54H53.4C56.4 90 60 124 63 151H29C32 124 35.6 90 38.6 54Z" fill={c.robe} />
          <path d="M44.2 58H47.8L48.6 144H43.4Z" fill={t.gold} strokeWidth={n2(lw * 0.7)} />
          {folk && (
            <path
              d={dotsPath([[23.4, 104], [20.4, 122], [26.4, 132], [68.6, 104], [71.6, 122], [65.6, 132], [66, 86]], 2.1)}
              fill={c.cloak === t.gold ? t.red : t.yellow}
              strokeWidth={n2(lw * 0.5)}
            />
          )}
          <path d="M13.4 143.4H78.6L79.4 151H12.6Z" fill={t.white} strokeWidth={n2(lw * 0.8)} />
          <path d="M20 144.6V149.6M30 144.6V149.6M40 144.6V149.6M52 144.6V149.6M62 144.6V149.6M72 144.6V149.6" fill="none" strokeWidth={1.3} />
          {sceptre ? (
            <>
              {limb('M33.6 53L25.6 70L31 81', c.cloak, t.limb + 0.6, lw)}
              <path d="M30 104L27.4 31" fill="none" strokeWidth={n2(2.2 + lw * 1.6)} />
              <path d="M30 104L27.4 31" fill="none" stroke={t.gold} strokeWidth={2.2} />
              <path d={starPath(4, 6.4, 2.6, -90, 27.2, 27.6)} fill={t.gold} strokeWidth={n2(lw * 0.8)} />
              <circle cx={30.4} cy={82.4} r={3.4} fill={t.skin} />
            </>
          ) : (
            <>
              {limb('M33.6 53L26 68L33 78', c.cloak, t.limb + 0.6, lw)}
              <circle cx={34.2} cy={79} r={3.4} fill={t.skin} />
            </>
          )}
          <path d="M28.6 52C33 44.4 59 44.4 63.4 52C61 60.6 53 64.6 46 64.6C39 64.6 31 60.6 28.6 52Z" fill={t.white} />
          <path d="M33.6 52.6V56M39 57V60.4M53 57V60.4M58.4 52.6V56" fill="none" strokeWidth={1.3} />
          {head(t, c, true, 46, 33.6)}
        </>,
      )}
      {standingHold(t, suit, c.cloak, suit === 'denari', bust)}
    </>
  );
}

/* Every sub-path below runs clockwise so the fused silhouette has no holes. */
const HORSE_FAR = 'M35.6 104L44.6 106L41.4 128L40.4 152H33L34 128ZM61.6 106L72.6 108L67.4 130L63 152H55.6L60 128Z';
const HORSE_NEAR =
  'M27 99C27 86 40 83 54 85C66 82 86 84 87 99C88 112 78 117 64 115C52 119 27 116 27 99Z' +
  'M27 104C20 92 21 74 27 59C32 53 41 55 43 62C46 73 51 81 60 87Z' +
  'M38 53C42 55 43 62 41 68C40 76 35 82 29 83L20 91C16 94 10 94 8 89C6.5 85 8 82 10 79L28 56C31 52 35 52 38 53Z' +
  'M33 53L33.6 43L39.6 51.6Z' +
  'M29 103L37 112L17.6 118L14.6 111.6Z' +
  'M14.6 111.6L22 113.6L25 131.4L17.6 132.4Z' +
  'M72 104L86 102L86 126L81.4 152H74L78 126Z';
const HOOVES = 'M32.8 147.6H40.6V152.6H32.8ZM55.4 147.6H63.2V152.6H55.4ZM73.8 147.6H81.6V152.6H73.8ZM16.8 127.6L24.4 126.4L25.2 131.8L17.6 133Z';

function cavallo(t: Theme, suit: Suit, c: Costume, bust: boolean): ReactNode {
  const lw = t.figLine;
  // In the cropped bust the horse is lifted so its whole head stays in view.
  const lift = bust ? 10 : 0;
  const horse = (
    <>
      <path d="M84.6 91C95 91 97.4 111 91.4 139C89.4 126 88 112 82.6 101Z" fill={c.mane} />
      {blob(HORSE_FAR, c.horseFar, lw)}
      {blob(HORSE_NEAR, c.horse, lw)}
      {!bust && <path d={HOOVES} fill={t.ink} stroke="none" />}
      {t.id === 'siciliane' && <path d={dotsPath([[75, 95], [81, 104], [71, 106]], 2.2)} fill={c.horseFar} stroke="none" />}
      <path d="M36.6 50.6C47 54 52 68 60.6 86.6L51.6 83C48.6 73 44.6 64 35.6 58Z" fill={c.mane} />
      <path d={dotsPath([[28.6, 64.6]], 1.6) + dotsPath([[10.8, 87.2]], 1)} fill={t.ink} stroke="none" />
      <path d={`M9.6 91L15 88.6M13.6 76L22.6 88.6M21.6 87C28 91 36 ${88 + lift} 42.6 ${81 + lift}`} fill="none" stroke={t.red} strokeWidth={1.6} />
      <path d="M40.6 85C48 83 58 83 66.4 85L69.4 107.6C58 111.6 48 111.6 38.6 107.6Z" fill={c.cloth} />
      <path d="M39.4 102.6C48 106.4 58 106.4 68.6 102.6" fill="none" stroke={c.cloth === t.yellow ? t.red : t.yellow} strokeWidth={2.2} />
    </>
  );
  return (
    <>
      {!bust && ground(t)}
      {bust ? <g transform={`translate(0 ${-lift})`}>{horse}</g> : horse}
      {limb('M46 65L40 74.6L42.4 80.4', c.alt, t.limb - 0.6, lw)}
      <circle cx={42.6} cy={81} r={3.1} fill={t.skin} />
      <path d="M43.4 62.6C46 58.6 58 58.6 60.6 62.6L62.6 86.6H41.6Z" fill={c.main} />
      <path d="M41.9 80H62.1L62.6 86.6H41.6Z" fill={t.gold} strokeWidth={n2(lw * 0.8)} />
      {!bust && (
        <>
          {limb('M52 87.6L45.4 103L46 117', c.hoseL, t.limb + 0.4, lw)}
          <path d="M41.6 115.6H50.4V124.6H36.6C36.6 120 38.6 116.6 41.6 115.6Z" fill={t.brown} />
        </>
      )}
      {head(t, c, false, 52, 47.4)}
      {riderHold(t, suit, c.alt)}
    </>
  );
}

/**
 * A court figure drawn in the full 100 x 170 box. With `bust` the parts below
 * the waist are skipped (used by the double-headed style, which crops them).
 */
export function courtArt(t: Theme, suit: Suit, court: Court, bust: boolean): ReactNode {
  const c = costume(t, suit);
  const body = court === 'fante' ? fante(t, suit, c, bust) : court === 'cavallo' ? cavallo(t, suit, c, bust) : re(t, suit, c, bust);
  return (
    <g stroke={t.ink} strokeWidth={t.figLine} strokeLinejoin="round" strokeLinecap="round" fill={t.ink}>
      {body}
    </g>
  );
}

/** The region of the full figure shown in each half of a double-headed card (90 : 80). */
export const BUST_CROP: Record<Court, string> = {
  fante: '19 6 72 64',
  cavallo: '5 8 90 80',
  re: '15 5 76.5 68',
};
