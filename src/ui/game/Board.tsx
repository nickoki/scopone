import { memo, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { CardBack, CardFace, type CardStyle } from '../../cards';
import { HIDDEN, type CardId, type MatchState } from '../../engine';
import type { CaptureAnim } from '../../game/types';
import { computeSprites, type Geometry, type Pose, type Sprite } from './layout';

export interface BoardMarks {
  /** Hand card lifted out of the fan: the selected one, or the one under the thumb. */
  raised: CardId | null;
  /** Table cards of the capture that will be made. */
  strong: readonly CardId[];
  /** Table cards that belong to another possible capture. */
  weak: readonly CardId[];
  /** Hand cards that can capture (tutorial). */
  hints: readonly CardId[];
  /** Hand cards that can sweep the table (tutorial). */
  sweeps: readonly CardId[];
}

interface BoardProps {
  view: MatchState;
  anim: CaptureAnim | null;
  perspective: number;
  g: Geometry;
  cardStyle: CardStyle;
  showIndex: boolean;
  largeIndex: boolean;
  /** The player may choose a card now. */
  interactive: boolean;
  marks: BoardMarks;
  dealStep: number;
  /** The thumb is on this hand card (null when it lifts). Fires while dragging across the hand. */
  onHandHover: (card: CardId | null) => void;
  /** The thumb lifted on this card. `tap` = it never left the card it went down on. */
  onHandPick: (card: CardId, tap: boolean) => void;
  onTableTap: (card: CardId) => void;
}

function poseTransform(p: Pose, g: Geometry): string {
  return `translate3d(${(p.x - g.cw / 2).toFixed(1)}px, ${(p.y - g.ch / 2).toFixed(1)}px, 0) rotate(${p.rot.toFixed(1)}deg) scale(${p.scale.toFixed(3)})`;
}

interface SpriteProps {
  s: Sprite;
  g: Geometry;
  cardStyle: CardStyle;
  showIndex: boolean;
  largeIndex: boolean;
  cls: string;
  onTap?: (card: CardId) => void;
}

const SpriteView = memo(function SpriteView({ s, g, cardStyle, showIndex, largeIndex, cls, onTap }: SpriteProps) {
  // The entrance animation is decided once, when the card first appears, and is
  // dropped as soon as it has played: a card must never replay its deal later.
  const [fly, setFly] = useState(s.fly);
  const style: CSSProperties & Record<'--from', string | undefined> = {
    width: g.cw,
    height: g.ch,
    transform: poseTransform(s, g),
    zIndex: s.z,
    '--from': fly ? poseTransform(fly, g) : undefined,
    animationDelay: fly ? `${fly.delay}ms` : undefined,
  };
  return (
    <div
      className={`sprite zone-${s.zone}${fly ? ' fly' : ''}${cls}`}
      style={style}
      onClick={onTap ? () => onTap(s.card) : undefined}
      onAnimationEnd={fly ? (e) => e.target === e.currentTarget && setFly(undefined) : undefined}
      data-card={s.card >= 0 ? s.card : undefined}
    >
      <div className="card">
        {s.faceUp && s.card !== HIDDEN ? (
          <CardFace card={s.card} style={cardStyle} showIndex={showIndex} largeIndex={largeIndex} />
        ) : (
          <CardBack style={cardStyle} />
        )}
      </div>
    </div>
  );
});

export function Board(props: BoardProps) {
  const { view, anim, perspective, g, cardStyle, showIndex, largeIndex, interactive, marks } = props;
  const root = useRef<HTMLDivElement | null>(null);

  // Cards that mount within a moment of a fresh deal fly in from the dealer.
  const deal = useRef({ hand: -1, at: 0 });
  if (deal.current.hand !== view.handNumber) deal.current = { hand: view.handNumber, at: Date.now() };
  const dealing = view.hand.history.length === 0 && view.phase === 'playing' && Date.now() - deal.current.at < 500;

  const sprites = computeSprites({ view, anim, perspective, g, raised: marks.raised, dealing, dealStep: props.dealStep });
  const capturing = anim ? anim.move.captured : [];

  // --- the hand: tap a card, or hold and slide across the fan; the card under
  // the thumb rises, and the one the thumb lifts from is picked.
  const handCards = sprites.filter((s) => s.zone === 'hand' && s.faceUp).sort((a, b) => a.x - b.x);
  const live = useRef({ handCards, cw: g.cw, props });
  live.current = { handCards, cw: g.cw, props };
  const drag = useRef<{ stop: () => void } | null>(null);
  useEffect(() => () => drag.current?.stop(), []);

  const cardAt = (clientX: number): CardId | null => {
    const el = root.current;
    const { handCards: cards, cw } = live.current;
    if (!el || cards.length === 0) return null;
    const x = clientX - el.getBoundingClientRect().left;
    // Cards overlap left to right: the visible part of each one starts at its left edge.
    let pick = cards[0]!.card;
    for (const s of cards) if (x >= s.x - cw / 2) pick = s.card;
    return pick;
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (!(e.target as HTMLElement).closest('.sprite.zone-hand')) return;
    const first = cardAt(e.clientX);
    if (first === null) return;
    const id = e.pointerId;
    let last = first;
    let moved = false;
    live.current.props.onHandHover(first);

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      const c = cardAt(ev.clientX);
      if (c !== null && c !== last) {
        last = c;
        moved = true;
        live.current.props.onHandHover(c);
      }
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      drag.current = null;
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      stop();
      live.current.props.onHandHover(null);
      live.current.props.onHandPick(last, !moved);
    };
    const cancel = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      stop();
      live.current.props.onHandHover(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    drag.current = { stop };
  };

  // A stable DOM order (by key) whatever zone a card is in: React then never
  // re-inserts a card's element, which would restart its CSS animations.
  const ordered = [...sprites].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  return (
    <div className="sprites" ref={root} onPointerDown={onPointerDown}>
      {ordered.map((s) => {
        let cls = '';
        let onTap: ((c: CardId) => void) | undefined;
        if (s.zone === 'hand' && s.faceUp) {
          if (s.card === marks.raised) cls += ' sel';
          else if (marks.sweeps.includes(s.card)) cls += ' hint hint-sweep';
          else if (marks.hints.includes(s.card)) cls += ' hint';
          if (!interactive) cls += ' idle';
        } else if (s.zone === 'table') {
          if (capturing.includes(s.card)) cls += ' taking';
          else if (marks.strong.includes(s.card)) cls += ' strong';
          else if (marks.weak.includes(s.card)) cls += ' weak';
          else if (marks.raised !== null && interactive) cls += ' dim';
          if (interactive && marks.raised !== null) onTap = props.onTableTap;
        }
        return (
          <SpriteView
            key={s.key}
            s={s}
            g={g}
            cardStyle={cardStyle}
            showIndex={showIndex}
            largeIndex={largeIndex}
            cls={cls}
            onTap={onTap}
          />
        );
      })}
    </div>
  );
}
