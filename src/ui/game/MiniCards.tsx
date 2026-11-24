import { CardFace, SuitIcon, type CardStyle } from '../../cards';
import { rankOf, suitOf, type CardId } from '../../engine';

/** A row of small face-up cards (used in dialogs and in the rules). */
export function MiniCards({
  cards,
  cardStyle,
  width = 46,
  showIndex = false,
  highlight,
}: {
  cards: readonly (CardId | null)[];
  cardStyle: CardStyle;
  width?: number;
  showIndex?: boolean;
  highlight?: readonly CardId[];
}) {
  return (
    <span className="mini-cards">
      {cards.map((c, i) =>
        c === null ? (
          <span key={`e${i}`} className="mini-card empty" style={{ width, height: width * 1.7 }} />
        ) : (
          <span
            key={c}
            className={`mini-card${highlight?.includes(c) ? ' hl' : ''}`}
            style={{ width, height: width * 1.7 }}
          >
            <CardFace card={c} style={cardStyle} showIndex={showIndex} />
          </span>
        ),
      )}
    </span>
  );
}

/** Compact text label for a card: value + suit symbol. */
export function CardChip({ card, cardStyle }: { card: CardId; cardStyle: CardStyle }) {
  return (
    <span className="card-chip">
      <b>{rankOf(card)}</b>
      <SuitIcon suit={suitOf(card)} style={cardStyle} size={16} />
    </span>
  );
}
