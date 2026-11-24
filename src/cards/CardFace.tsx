import { memo } from 'react';
import type { JSX, ReactNode } from 'react';
import { rankOf, suitOf } from '../engine/cards';
import type { Suit } from '../engine/cards';
import { CARD_H, CARD_W, THEMES } from './themes';
import type { CardStyle, Theme } from './themes';
import { backArt } from './backs';
import { BUST_CROP, courtArt } from './figures';
import type { Court } from './figures';
import { pipArt } from './pips';
import { miniSuit, suitSymbol } from './suits';

const VIEW_BOX = `0 0 ${CARD_W} ${CARD_H}`;
const INDEX_FONT = "system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif";
const SVG_STYLE = { display: 'block' } as const;

const RANK_NAMES = ['', 'Asso', 'Due', 'Tre', 'Quattro', 'Cinque', 'Sei', 'Sette', 'Fante', 'Cavallo', 'Re'];
const COURTS: Record<number, Court> = { 8: 'fante', 9: 'cavallo', 10: 're' };

/** Shrinks the art towards the bottom-right so the corner index never covers it. */
const INDEX_SHIFT = 'translate(8 16.5) scale(0.9)';

function paper(t: Theme): ReactNode {
  return <rect x={0.5} y={0.5} width={CARD_W - 1} height={CARD_H - 1} rx={7} fill={t.paper} stroke={t.edge} strokeWidth={1} />;
}

function frame(t: Theme): ReactNode {
  if (t.frame === 'line') {
    return <rect x={4} y={4} width={92} height={162} rx={4} fill="none" stroke={t.frameColor} strokeWidth={0.9} />;
  }
  if (t.frame === 'band') {
    return <rect x={3.4} y={3.4} width={93.2} height={163.2} rx={5} fill="none" stroke={t.frameColor} strokeWidth={1.8} />;
  }
  return null;
}

function indexChip(t: Theme, suit: Suit, rank: number): ReactNode {
  return (
    <>
      <rect x={3} y={3} width={16} height={28} rx={3.4} fill={t.white} stroke={t.ink} strokeWidth={0.7} />
      <text
        x={11}
        y={15.6}
        textAnchor="middle"
        fontFamily={INDEX_FONT}
        fontWeight={800}
        fontSize={rank === 10 ? 12 : 14}
        letterSpacing={rank === 10 ? -1 : 0}
        fill={t.suitInk[suit]}
      >
        {rank}
      </text>
      {miniSuit(suit, t, 11, 23.4)}
    </>
  );
}

function faceArt(style: CardStyle, card: number, showIndex: boolean): ReactNode {
  const t = THEMES[style];
  const suit = suitOf(card);
  const rank = rankOf(card);
  const court = COURTS[rank];
  const fit = t.artScale === 1 ? '' : `translate(${(CARD_W * (1 - t.artScale)) / 2} ${(CARD_H * (1 - t.artScale)) / 2}) scale(${t.artScale})`;

  let art: ReactNode;
  if (court && t.doubleHeaded) {
    // Mirrored busts fill the frame; each half is cropped by a nested <svg>.
    const half = (
      <svg x={5} y={5} width={90} height={80} viewBox={BUST_CROP[court]}>
        {courtArt(t, suit, court, true)}
      </svg>
    );
    art = (
      <>
        {half}
        <g transform="rotate(180 50 85)">{half}</g>
        <path d="M4 85H96" stroke={t.ink} strokeWidth={1.4} />
      </>
    );
  } else {
    const inner = court ? courtArt(t, suit, court, false) : pipArt(t, suit, rank);
    const transform = `${showIndex ? INDEX_SHIFT : ''} ${fit}`.trim();
    art = transform ? <g transform={transform}>{inner}</g> : inner;
  }

  return (
    <>
      {paper(t)}
      {frame(t)}
      {art}
      {showIndex && indexChip(t, suit, rank)}
    </>
  );
}

/** Card art never changes, so each face is built once and the element tree reused. */
const faceCache = new Map<string, ReactNode>();

function cachedFace(style: CardStyle, card: number, showIndex: boolean): ReactNode {
  const key = `${style}:${card}:${showIndex ? 1 : 0}`;
  let art = faceCache.get(key);
  if (art === undefined) {
    art = faceArt(style, card, showIndex);
    faceCache.set(key, art);
  }
  return art;
}

export interface CardFaceProps {
  card: number;
  style: CardStyle;
  showIndex?: boolean;
}

function CardFaceImpl({ card, style, showIndex = false }: CardFaceProps): JSX.Element {
  const id = Math.min(39, Math.max(0, Math.trunc(card) || 0));
  return (
    <svg
      viewBox={VIEW_BOX}
      width="100%"
      height="100%"
      style={SVG_STYLE}
      role="img"
      aria-label={`${RANK_NAMES[rankOf(id)]} di ${suitOf(id)}`}
    >
      {cachedFace(style in THEMES ? style : 'napoletane', id, showIndex)}
    </svg>
  );
}

export interface CardBackProps {
  style: CardStyle;
}

function CardBackImpl({ style }: CardBackProps): JSX.Element {
  const t = THEMES[style] ?? THEMES.napoletane;
  return (
    <svg viewBox={VIEW_BOX} width="100%" height="100%" style={SVG_STYLE} role="img" aria-label="Carta coperta">
      <rect x={0.5} y={0.5} width={CARD_W - 1} height={CARD_H - 1} rx={7} fill={t.white} stroke={t.edge} strokeWidth={1} />
      {backArt(t.id)}
    </svg>
  );
}

export interface SuitIconProps {
  suit: Suit;
  style?: CardStyle;
  size?: number;
}

const ICON_STYLE = { display: 'inline-block', verticalAlign: 'middle' } as const;

function SuitIconImpl({ suit, style = 'napoletane', size = 16 }: SuitIconProps): JSX.Element {
  const t = THEMES[style] ?? THEMES.napoletane;
  const long = suit === 'spade' || suit === 'bastoni';
  return (
    <svg viewBox="-12 -12 24 24" width={size} height={size} style={ICON_STYLE} role="img" aria-label={suit}>
      {suitSymbol(suit, t, 0, 0, long ? 30 : suit === 'coppe' ? 22 : 22, { rot: long ? 45 : 0, line: 1.1 })}
    </svg>
  );
}

export const CardFace = memo(CardFaceImpl);
export const CardBack = memo(CardBackImpl);
export const SuitIcon = memo(SuitIconImpl);
