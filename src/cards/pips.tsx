import type { ReactNode } from 'react';
import type { Suit } from '../engine/cards';
import type { Theme } from './themes';
import type { Pt } from './geom';
import { dotsPath, laurelPath, leafPath, petalsPath, starPath } from './geom';
import { suitSymbol } from './suits';

/** [x, y, rotation, size multiplier] */
type Slot = readonly [number, number, number?, number?];

/** Layouts for coins and cups (compact symbols). */
const COINS: Record<number, readonly Slot[]> = {
  2: [[50, 46], [50, 124]],
  3: [[50, 33], [50, 85], [50, 137]],
  4: [[28, 47], [72, 47], [28, 123], [72, 123]],
  5: [[28, 37], [72, 37], [50, 85], [28, 133], [72, 133]],
  6: [[28, 33], [72, 33], [28, 85], [72, 85], [28, 137], [72, 137]],
  7: [[25, 29], [75, 29], [50, 57], [25, 85], [75, 85], [25, 141], [75, 141]],
};
const CUPS: Record<number, readonly Slot[]> = {
  2: [[50, 46], [50, 124]],
  3: [[50, 33], [50, 85], [50, 137]],
  4: [[27, 47], [73, 47], [27, 123], [73, 123]],
  5: [[27, 37], [73, 37], [50, 85], [27, 133], [73, 133]],
  6: [[27, 33], [73, 33], [27, 85], [73, 85], [27, 137], [73, 137]],
  7: [[25, 28], [75, 28], [50, 58.5], [25, 86], [75, 86], [25, 142], [75, 142]],
};
const COIN_SIZE: Record<number, number> = { 2: 52, 3: 43, 4: 39, 5: 36, 6: 36, 7: 31 };
const CUP_SIZE: Record<number, number> = { 2: 62, 3: 46, 4: 50, 5: 43, 6: 45, 7: 33 };

/** Layouts for swords and clubs (long symbols). The lower rows point down so the card reads both ways up. */
const LONG: Record<number, readonly Slot[]> = {
  2: [[50, 85, -24], [50, 85, 24]],
  3: [[21, 85], [50, 85, 180], [79, 85]],
  4: [[29, 45], [71, 45], [29, 125, 180], [71, 125, 180]],
  5: [[22, 44], [78, 44], [50, 85, 0, 1.36], [22, 126, 180], [78, 126, 180]],
  6: [[22, 45], [50, 45], [78, 45], [22, 125, 180], [50, 125, 180], [78, 125, 180]],
  7: [[22, 39], [50, 39], [78, 39], [50, 85, 90, 1.3], [22, 131, 180], [50, 131, 180], [78, 131, 180]],
};
const LONG_SIZE: Record<number, number> = { 2: 138, 3: 106, 4: 72, 5: 62, 6: 70, 7: 56 };

/** Spots left empty by each layout, where the Sicilian deck plants little flowers. */
const ROUND_GAPS: Record<number, readonly Pt[]> = {
  2: [[50, 85], [22, 85], [78, 85]],
  3: [[23, 59], [77, 59], [23, 111], [77, 111]],
  4: [[50, 85], [50, 22], [50, 148]],
  5: [[50, 30], [50, 140], [20, 85], [80, 85]],
  6: [[50, 59], [50, 111]],
  7: [[50, 113], [50, 16]],
};
const LONG_GAPS: Record<number, readonly Pt[]> = {
  2: [[50, 26], [50, 144], [22, 85], [78, 85]],
  3: [[36.5, 20], [63.5, 150]],
  4: [[50, 47], [50, 123], [50, 85]],
  5: [[50, 22], [50, 148]],
  6: [[36, 85], [64, 85]],
  7: [[10, 85], [90, 85]],
};

function florets(t: Theme, pts: readonly Pt[], r: number): ReactNode {
  return (
    <>
      <path
        d={pts.map(([x, y]) => petalsPath(4, r, 42, 45, x, y)).join('')}
        fill={t.red}
        stroke={t.ink}
        strokeWidth={0.6}
        strokeLinejoin="round"
      />
      <path d={dotsPath(pts, r * 0.3)} fill={t.yellow} stroke={t.ink} strokeWidth={0.5} />
    </>
  );
}

/* ------------------------------------------------------------------- aces */

/** Four little corner lozenges for the plainer Piacentine aces. */
function studs(t: Theme): ReactNode {
  const d = [[17, 22], [83, 22], [17, 148], [83, 148]].map(([x, y]) => starPath(4, 7, 3.2, -90, x, y)).join('');
  return <path d={d} fill={t.yellow} stroke={t.ink} strokeWidth={1} strokeLinejoin="round" />;
}

function aceDenari(t: Theme): ReactNode {
  if (t.id === 'piacentine') {
    // A heraldic bird of our own, wings raised, carrying the coin on its breast.
    const wing = 'M45 70C37 54 24 42 11 30C13 42 9 50 8 58C12 57 12 66 12 74C16 71 17 81 19 89C23 84 26 93 30 99C33 92 39 95 44 100Z';
    return (
      <g stroke={t.ink} strokeWidth={1.3} strokeLinejoin="round">
        <path d="M41 112L33 148L43 141L50 153L57 141L67 148L59 112Z" fill={t.blue} />
        <path d="M43 141L46 118M57 141L54 118M50 153V120" fill="none" strokeWidth={0.9} />
        <path d={wing} fill={t.blue} />
        <path d={wing} fill={t.blue} transform="matrix(-1 0 0 1 100 0)" />
        <path
          d="M22 44C24 54 21 62 20 70M30 54C32 64 29 74 29 82M70 54C68 64 71 74 71 82M78 44C76 54 79 62 80 70"
          fill="none"
          stroke={t.blueLight}
          strokeWidth={1.4}
          strokeLinecap="round"
        />
        <path d="M43 68C43 54 45 48 45 40C45 30 57 30 57 40C57 48 57 54 57 68Z" fill={t.blue} />
        <path d="M45.5 37L35 42L46 45Z" fill={t.yellow} />
        <path d="M44 31L42.5 21L47 26L51 18L55 26L59.5 21L58 31Z" fill={t.yellow} />
        <circle cx={50.5} cy={37.5} r={1.5} fill={t.white} strokeWidth={0.8} />
        {suitSymbol('denari', t, 50, 91, 50, { rich: true, line: 1.4 })}
      </g>
    );
  }
  if (t.id === 'siciliane') {
    return (
      <>
        <path d={starPath(16, 44, 30, -90, 50, 85)} fill={t.yellow} stroke={t.ink} strokeWidth={1.4} strokeLinejoin="round" />
        {suitSymbol('denari', t, 50, 85, 66, { rich: true, line: 1.6 })}
        {florets(t, [[18, 22], [82, 22], [18, 148], [82, 148]], 8)}
      </>
    );
  }
  const palm = (y: number, dir: 1 | -1): ReactNode => (
    <>
      <path
        d={
          leafPath(50, y, -90 * dir - 62, 24, 5.5) +
          leafPath(50, y, -90 * dir + 62, 24, 5.5) +
          leafPath(50, y, -90 * dir - 31, 28, 5.5) +
          leafPath(50, y, -90 * dir + 31, 28, 5.5)
        }
        fill={t.green}
        stroke={t.ink}
        strokeWidth={1.1}
        strokeLinejoin="round"
      />
      <path d={leafPath(50, y, -90 * dir, 31, 6)} fill={t.red} stroke={t.ink} strokeWidth={1.1} strokeLinejoin="round" />
    </>
  );
  return (
    <>
      {palm(50, 1)}
      {palm(120, -1)}
      <path d={dotsPath([[14, 85], [86, 85]], 2.6)} fill={t.blue} stroke={t.ink} strokeWidth={1} />
      {suitSymbol('denari', t, 50, 85, 68, { rich: true, line: 1.7 })}
    </>
  );
}

function aceCoppe(t: Theme): ReactNode {
  if (t.id === 'piacentine') {
    return (
      <g stroke={t.ink} strokeWidth={1.3} strokeLinejoin="round">
        <path d="M14 46L50 17L86 46Z" fill={t.yellow} />
        <path d="M27 46L50 27L73 46Z" fill={t.blue} strokeWidth={1} />
        <circle cx={50} cy={14} r={5} fill={t.red} />
        {suitSymbol('coppe', t, 50, 96, 104, { rich: true, line: 1.5 })}
      </g>
    );
  }
  if (t.id === 'siciliane') {
    return (
      <>
        <path d={starPath(12, 17, 10.5, -90, 50, 32)} fill={t.gold} stroke={t.ink} strokeWidth={1.4} strokeLinejoin="round" />
        <circle cx={50} cy={32} r={7.4} fill={t.yellow} stroke={t.ink} strokeWidth={1.2} />
        {suitSymbol('coppe', t, 50, 104, 84, { rich: true, line: 1.7 })}
        {florets(t, [[16, 24], [84, 24], [14, 150], [86, 150]], 7.5)}
      </>
    );
  }
  return (
    <g stroke={t.ink} strokeWidth={1.4} strokeLinejoin="round">
      <circle cx={50} cy={17} r={5.2} fill={t.blue} />
      <path d="M14 47C18 16 82 16 86 47Z" fill={t.gold} />
      <path d="M22.5 38C34 30 66 30 77.5 38" fill="none" stroke={t.red} strokeWidth={3.2} />
      {suitSymbol('coppe', t, 50, 97, 104, { rich: true, line: 1.6 })}
    </g>
  );
}

function aceSpade(t: Theme): ReactNode {
  if (t.id === 'piacentine') {
    return (
      <>
        {studs(t)}
        {suitSymbol('spade', t, 50, 85, 146, { line: 1.4 })}
        <g stroke={t.ink} strokeWidth={1.2} strokeLinejoin="round">
          <path d="M12 66L22 74L12 82H38V66ZM88 66L78 74L88 82H62V66Z" fill={t.redDeep} />
          <path d="M26 60H74V78H26Z" fill={t.red} />
          <path d="M30 69H70" fill="none" stroke={t.yellow} strokeWidth={2.2} strokeLinecap="round" />
        </g>
      </>
    );
  }
  if (t.id === 'siciliane') {
    return (
      <>
        <path d="M30 40L27 22L38 31L50 16L62 31L73 22L70 40Z" fill={t.yellow} stroke={t.ink} strokeWidth={1.5} strokeLinejoin="round" />
        {suitSymbol('spade', t, 50, 88, 138, { line: 1.7 })}
        <path d="M30 40H70V47H30Z" fill={t.red} stroke={t.ink} strokeWidth={1.5} strokeLinejoin="round" />
        {florets(t, [[20, 76], [80, 76], [18, 128], [82, 128]], 7.5)}
      </>
    );
  }
  return (
    <>
      <path
        d={laurelPath(50, 72, 32, 112, 236, 5, 15, 4.6) + laurelPath(50, 72, 32, 68, -56, 5, 15, 4.6)}
        fill={t.green}
        stroke={t.ink}
        strokeWidth={0.9}
        strokeLinejoin="round"
      />
      {suitSymbol('spade', t, 50, 85, 148, { line: 1.6 })}
      <path
        d="M50 104C40 96 30 100 33 108C35 113 44 110 50 104C56 110 65 113 67 108C70 100 60 96 50 104ZM47 105L40 122L46 119L49 106ZM53 105L60 122L54 119L51 106Z"
        fill={t.red}
        stroke={t.ink}
        strokeWidth={1.1}
        strokeLinejoin="round"
      />
    </>
  );
}

function aceBastoni(t: Theme): ReactNode {
  if (t.id === 'piacentine') {
    return (
      <>
        {studs(t)}
        {suitSymbol('bastoni', t, 50, 85, 146, { line: 1.4 })}
        <g stroke={t.ink} strokeWidth={1.2} strokeLinejoin="round">
          <path d="M12 92L22 100L12 108H38V92ZM88 92L78 100L88 108H62V92Z" fill={t.redDeep} />
          <path d="M26 86H74V104H26Z" fill={t.red} />
          <path d="M30 95H70" fill="none" stroke={t.yellow} strokeWidth={2.2} strokeLinecap="round" />
        </g>
      </>
    );
  }
  if (t.id === 'siciliane') {
    return (
      <>
        <path
          d={leafPath(46, 100, 205, 30, 8) + leafPath(54, 112, -25, 30, 8) + leafPath(46, 124, 160, 24, 7)}
          fill={t.greenLight}
          stroke={t.ink}
          strokeWidth={1.4}
          strokeLinejoin="round"
        />
        {suitSymbol('bastoni', t, 50, 85, 142, { line: 1.7 })}
        {florets(t, [[20, 30], [80, 30], [82, 140], [18, 146]], 7.5)}
      </>
    );
  }
  return (
    <>
      <path
        d={
          leafPath(47, 92, 215, 34, 8) +
          leafPath(53, 104, -35, 34, 8) +
          leafPath(47, 118, 150, 26, 7) +
          leafPath(53, 128, 30, 24, 6.5)
        }
        fill={t.greenLight}
        stroke={t.ink}
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
      {suitSymbol('bastoni', t, 50, 85, 148, { line: 1.6 })}
      <path d="M38 62Q50 70 62 62L63 71Q50 79 37 71Z" fill={t.red} stroke={t.ink} strokeWidth={1.2} strokeLinejoin="round" />
    </>
  );
}

/* ----------------------------------------------------------- number cards */

/** The art for ranks 1-7, drawn in the full 100 x 170 box. */
export function pipArt(t: Theme, suit: Suit, rank: number): ReactNode {
  if (rank === 1) {
    switch (suit) {
      case 'denari':
        return aceDenari(t);
      case 'coppe':
        return aceCoppe(t);
      case 'spade':
        return aceSpade(t);
      default:
        return aceBastoni(t);
    }
  }
  const round = suit === 'denari' || suit === 'coppe';
  const slots = (suit === 'denari' ? COINS : suit === 'coppe' ? CUPS : LONG)[rank] ?? [];
  const base = (suit === 'denari' ? COIN_SIZE : suit === 'coppe' ? CUP_SIZE : LONG_SIZE)[rank] ?? 30;
  // The Sicilian chalices carry handles, so they need a little more elbow room.
  const scale = suit === 'coppe' && t.id === 'siciliane' ? 0.8 : t.pipScale;
  const settebello = suit === 'denari' && rank === 7;
  const symbols = slots.map(([x, y, rot, mul], i) => {
    const star = settebello && i === 2;
    return suitSymbol(suit, t, x, y, base * scale * (mul ?? 1) * (star ? 1.1 : 1), { rot, key: i, rich: star });
  });
  return (
    <>
      {settebello && (
        <path d={starPath(16, 21.6, 17, -90, 50, 57)} fill={t.red} stroke={t.ink} strokeWidth={1} strokeLinejoin="round" />
      )}
      {t.id === 'siciliane' && florets(t, (round ? ROUND_GAPS : LONG_GAPS)[rank] ?? [], rank >= 6 ? 4.6 : 5.6)}
      {symbols}
    </>
  );
}
