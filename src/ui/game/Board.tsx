import { memo, useRef, useState, type CSSProperties } from 'react';
import { CardBack, CardFace, type CardStyle } from '../../cards';
import { HIDDEN, type CardId, type MatchState } from '../../engine';
import type { CaptureAnim } from '../../game/types';
import { computeSprites, type Geometry, type Pose, type Sprite } from './layout';

export interface BoardMarks {
  selected: CardId | null;
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
  interactive: boolean;
  marks: BoardMarks;
  onHandTap: (card: CardId) => void;
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
  cls: string;
  onTap?: (card: CardId) => void;
}

const SpriteView = memo(function SpriteView({ s, g, cardStyle, showIndex, cls, onTap }: SpriteProps) {
  // The entrance animation is decided once, when the card first appears.
  const [fly] = useState(s.fly);
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
      data-card={s.card >= 0 ? s.card : undefined}
    >
      <div className="card">
        {s.faceUp && s.card !== HIDDEN ? (
          <CardFace card={s.card} style={cardStyle} showIndex={showIndex} />
        ) : (
          <CardBack style={cardStyle} />
        )}
      </div>
    </div>
  );
});

export function Board(props: BoardProps) {
  const { view, anim, perspective, g, cardStyle, showIndex, interactive, marks } = props;

  // Cards that mount within a moment of a fresh deal fly in from the dealer.
  const deal = useRef({ hand: -1, at: 0 });
  if (deal.current.hand !== view.handNumber) deal.current = { hand: view.handNumber, at: Date.now() };
  const dealing = view.hand.history.length === 0 && view.phase === 'playing' && Date.now() - deal.current.at < 500;

  const sprites = computeSprites({ view, anim, perspective, g, selected: marks.selected, dealing });
  const capturing = anim ? anim.move.captured : [];

  return (
    <div className="sprites">
      {sprites.map((s) => {
        let cls = '';
        let onTap: ((c: CardId) => void) | undefined;
        if (s.zone === 'hand' && s.faceUp) {
          if (interactive) onTap = props.onHandTap;
          if (s.card === marks.selected) cls += ' sel';
          else if (marks.sweeps.includes(s.card)) cls += ' hint hint-sweep';
          else if (marks.hints.includes(s.card)) cls += ' hint';
          if (!interactive) cls += ' idle';
        } else if (s.zone === 'table') {
          if (capturing.includes(s.card)) cls += ' taking';
          else if (marks.strong.includes(s.card)) cls += ' strong';
          else if (marks.weak.includes(s.card)) cls += ' weak';
          else if (marks.selected !== null) cls += ' dim';
          if (interactive && marks.selected !== null) onTap = props.onTableTap;
        }
        return (
          <SpriteView key={s.key} s={s} g={g} cardStyle={cardStyle} showIndex={showIndex} cls={cls} onTap={onTap} />
        );
      })}
    </div>
  );
}
