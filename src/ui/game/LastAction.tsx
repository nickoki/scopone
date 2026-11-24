import type { CSSProperties } from 'react';
import { SuitIcon, type CardStyle } from '../../cards';
import { rankOf, suitOf, type CardId, type PlayedMove } from '../../engine';

function Chip({ card, cardStyle, taken }: { card: CardId; cardStyle: CardStyle; taken?: boolean }) {
  return (
    <span className={`la-chip${taken ? ' taken' : ''}`}>
      <b>{rankOf(card)}</b>
      <SuitIcon suit={suitOf(card)} style={cardStyle} size={13} />
    </span>
  );
}

/**
 * A player's most recent action: the card they played and, after the arrow,
 * what it captured (nothing after the card = it was laid on the table).
 * Only the latest action of each player is ever shown; it is replaced the
 * next time that player plays, so there is no history to read back.
 */
export function LastAction({
  move,
  cardStyle,
  scopaLabel,
  label,
  variant,
  style,
}: {
  move: PlayedMove;
  cardStyle: CardStyle;
  scopaLabel: string;
  /** Accessible description, e.g. "Rosa: last play". */
  label: string;
  variant: 'col' | 'row' | 'me';
  style?: CSSProperties;
}) {
  const took = move.captured.length > 0;
  return (
    <div className={`last-action ${variant}${took ? ' took' : ''}`} style={style} role="status" aria-label={label}>
      <span className="la-played">
        <Chip card={move.card} cardStyle={cardStyle} />
        {took && (
          <span className="la-arrow" aria-hidden="true">
            ➜
          </span>
        )}
      </span>
      {took && (
        <span className="la-taken">
          {move.captured.map((c) => (
            <Chip key={c} card={c} cardStyle={cardStyle} taken />
          ))}
        </span>
      )}
      {move.scopa && <span className="la-scopa">{scopaLabel}</span>}
    </div>
  );
}
