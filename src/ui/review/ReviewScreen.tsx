import { useEffect, useMemo, useRef, useState } from 'react';
import { CardFace, SuitIcon } from '../../cards';
import type { HandReviews } from '../../analysis/useHandReviews';
import type { HandReview, MoveOption, MoveReview, Reason } from '../../analysis/types';
import { rankOf, suitOf, type CardId, type Move, type Seat } from '../../engine';
import { useT, type Dict } from '../../i18n';
import { isUnlocked } from '../../state/entitlements';
import { useSettings } from '../../state/settings';
import { IconButton, ScreenHeader, Segmented } from '../common';
import { ClassCounts, ScoreRing } from './AccuracySummary';
import { CLASS_STYLE } from './classes';

function Chip({ card, taken }: { card: CardId; taken?: boolean }) {
  const { settings } = useSettings();
  return (
    <span className={`rv-chip${taken ? ' taken' : ''}`}>
      <b>{rankOf(card)}</b>
      <SuitIcon suit={suitOf(card)} style={settings.cardStyle} size={15} />
    </span>
  );
}

/** A move written as chips: the card, then what it takes (or "laid on the table"). */
function MoveChips({ move, t }: { move: Move; t: Dict }) {
  return (
    <span className="rv-move">
      <Chip card={move.card} />
      {move.capture.length > 0 ? (
        <>
          <span className="rv-arrow" aria-hidden="true">
            ➜
          </span>
          {move.capture.map((c) => (
            <Chip key={c} card={c} taken />
          ))}
        </>
      ) : (
        <small>{t.review.lays}</small>
      )}
    </span>
  );
}

function reasonText(r: Reason, t: Dict): string {
  const R = t.review.reasons;
  switch (r.code) {
    case 'missedScopa':
      return R.missedScopa();
    case 'sweepGift':
      return R.sweepGift(r.sum, t.review.rank(r.sum), r.out, r.pct, r.bestPct);
    case 'tableSafe':
      return R.tableSafe(r.sum);
    case 'nearScopa':
      return R.nearScopa(r.pct, r.bestPct);
    case 'partnerScopa':
      return R.partnerScopa(r.pct, r.playedPct);
    case 'nearSettebello':
      return R.nearSettebello(r.pct, r.bestPct);
    case 'missedNapola':
      return R.missedNapola(r.n);
    case 'missedSettebello':
      return R.missedSettebello();
    case 'bankSettebello':
      return R.bankSettebello();
    case 'laidSettebello':
      return R.laidSettebello(r.pct, r.bestPct);
    case 'missedReBello':
      return R.missedReBello();
    case 'moreDenari':
      return R.moreDenari(r.n);
    case 'missedSeven':
      return R.missedSeven();
    case 'moreCards':
      return R.moreCards(r.n);
    case 'exposedCard':
      return R.exposedCard(r.pct, r.bestPct);
    case 'category':
      return R.category(t.review.categories[r.category]);
    case 'longTerm':
      return R.longTerm();
    case 'restLater':
      return R.restLater();
    case 'tookScopa':
      return R.tookScopa();
    case 'tookSettebello':
      return R.tookSettebello();
    case 'keptSafe':
      return R.keptSafe(r.sum);
    case 'leastRisk':
      return R.leastRisk(r.pct, r.otherPct);
  }
}

const fmt = (x: number, lang: string, digits = 1) => x.toFixed(digits).replace('.', lang === 'it' ? ',' : '.');

/** Small face-up cards with the played / better card ringed. */
function MarkedCards({
  cards,
  width,
  played,
  better,
  color,
}: {
  cards: readonly CardId[];
  /** Largest width of one card; they shrink together to stay on one row. */
  width: number;
  played: readonly CardId[];
  better: readonly CardId[];
  color: string;
}) {
  const { settings } = useSettings();
  return (
    <span className="rv-cards">
      {cards.map((c) => {
        const isPlayed = played.includes(c);
        const isBetter = better.includes(c);
        return (
          <span
            key={c}
            className={`rv-card${isPlayed ? ' played' : ''}${isBetter ? ' better' : ''}`}
            style={{ maxWidth: width, ...(isPlayed ? { boxShadow: `0 0 0 3px ${color}` } : null) }}
          >
            <CardFace card={c} style={settings.cardStyle} showIndex={settings.showIndex} largeIndex={settings.largeText} />
          </span>
        );
      })}
    </span>
  );
}

/** One legal move in the ranked list: how far behind the best move it is. */
function OptionRow({
  o,
  worst,
  isPlayed,
  isBest,
  playedLoss,
  t,
  lang,
}: {
  o: MoveOption;
  worst: number;
  isPlayed: boolean;
  isBest: boolean;
  /** For the row of the move played: the same figure as in the verdict above (null = nothing held against it). */
  playedLoss: number | null;
  t: Dict;
  lang: string;
}) {
  // "≈ equal" only when the gap itself is small; a larger gap that is still within the noise (a move dropped
  // after the first deals) is shown as a number marked as rough, so label, order and bar agree.
  const gap = -o.delta;
  const behind = isPlayed
    ? playedLoss === null
      ? t.review.evenTag
      : `−${fmt(playedLoss, lang, playedLoss < 0.1 ? 2 : 1)}`
    : gap < 0.05 || (o.even && gap < 0.15)
      ? t.review.evenTag
      : `${o.even ? '≈ ' : ''}−${fmt(gap, lang)}`;
  // Full bar for the best move, shrinking with the points given up.
  const width = Math.round(100 - 92 * (worst > 0 ? Math.min(1, -o.delta / worst) : 0));
  return (
    <li className={`rv-option${isPlayed ? ' played' : ''}`}>
      <MoveChips move={o.move} t={t} />
      <span className="rv-tags">
        {isBest && <i className="rv-tag best">{t.review.bestTag}</i>}
        {isPlayed && <i className="rv-tag you">{t.review.youTag}</i>}
      </span>
      <span className="rv-bar" aria-hidden="true">
        <span style={{ width: `${width}%` }} />
      </span>
      <span className="rv-ev">{isBest ? '' : behind}</span>
    </li>
  );
}

/** The heading of a move: its class, or what it was instead of a scored decision. */
function moveLabel(m: MoveReview, t: Dict): string {
  return m.auto ? t.review.autoLabel : m.even ? t.review.evenLabel : t.review.classes[m.cls];
}

function MoveDetail({ m, k, n, name, usThem, names, t, lang }: { m: MoveReview; k: number; n: number; name: string; usThem: boolean; names: string[]; t: Dict; lang: string }) {
  const style = CLASS_STYLE[m.cls];
  const played = m.options[m.played]!;
  const best = m.options[0]!;
  const differs = m.played !== 0 && m.cls !== 'best' && m.cls !== 'brilliant' && m.cls !== 'forced';
  const fewOptions = m.options.length > 1 && !m.auto;
  // The bars are scaled to the worst move, but never to less than 0.3 points: in a near-even decision all bars stay long.
  const worst = Math.max(0.3, ...m.options.map((o) => -o.delta));
  const label = moveLabel(m, t);
  // The gap as measured (the same number as in the list of moves below). What is held against the player
  // can be less: the benefit of the doubt, and the limits explained in the notes under the reasons.
  const charged = m.cls !== 'forced' && m.credited > 0;
  const shownLoss = Math.max(-played.delta, m.credited);
  return (
    <article className="rv-detail">
      <header className="rv-verdict" style={{ borderColor: style.color }}>
        <span className="rv-badge" style={{ background: style.color, color: style.ink }}>
          {m.even ? '=' : style.symbol}
        </span>
        <span className="rv-verdict-text">
          <b>{label}</b>
          <small>
            {t.review.moveOf(k, n)}
            {m.cls !== 'forced' && ` · ${charged ? t.review.lost(fmt(shownLoss, lang, shownLoss < 0.1 ? 2 : 1)) : t.review.noLoss}`}
          </small>
        </span>
      </header>

      <section>
        <h3>{usThem ? t.review.before : t.review.beforeOf(name)}</h3>
        {m.since.length === 0 ? (
          <p className="rv-muted">{t.review.opening}</p>
        ) : (
          <ul className="rv-since">
            {m.since.map((s, i) => (
              <li key={i}>
                <span className="rv-who">{names[s.seat]}</span>
                <MoveChips move={{ card: s.card, capture: s.captured }} t={t} />
                {s.scopa && <i className="rv-scopa">{t.game.scopa}</i>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3>{t.review.table}</h3>
        {m.table.length === 0 ? (
          <p className="rv-muted">{t.review.emptyTable}</p>
        ) : (
          <div className="rv-felt">
            <MarkedCards cards={m.table} width={46} played={played.move.capture} better={differs ? best.move.capture : []} color={style.color} />
          </div>
        )}
      </section>

      <section>
        <h3>{t.review.cards}</h3>
        <MarkedCards cards={m.hand} width={46} played={[played.move.card]} better={differs ? [best.move.card] : []} color={style.color} />
      </section>

      <section className="rv-compare">
        <div className="rv-line">
          <span className="rv-label" style={{ color: style.color }}>
            {t.review.played}
          </span>
          <MoveChips move={played.move} t={t} />
        </div>
        {differs && (
          <div className="rv-line">
            <span className="rv-label better">{t.review.better}</span>
            <MoveChips move={best.move} t={t} />
          </div>
        )}
        {!usThem && m.reasons.length > 0 && <p className="rv-for">{t.review.forPlayer(name)}</p>}
        {m.reasons.length > 0 && (
          <ul className="rv-reasons">
            {m.reasons.map((r, i) => (
              <li key={i}>{reasonText(r, t)}</li>
            ))}
          </ul>
        )}
        {m.auto && <p className="rv-muted">{t.review.autoMove}</p>}
        {m.even && <p className="rv-muted">{t.review.equal}</p>}
        {m.matchSafe && (
          <p className="rv-muted">
            {t.review.matchSafe} {t.review.countsAs(fmt(m.credited, lang, 2))}
          </p>
        )}
        {m.capped && !m.matchSafe && <p className="rv-muted">{t.review.capped(fmt(m.credited, lang))}</p>}
        {!m.auto && !m.even && m.cls === 'forced' && <p className="rv-muted">{t.review.forcedMove}</p>}
        {(m.cls === 'best' || m.cls === 'brilliant') && m.played !== 0 && <p className="rv-muted">{t.review.noClearBetter}</p>}
      </section>

      {fewOptions && (
        <details className="rv-all">
          <summary>{t.review.allMoves}</summary>
          <ul>
            {m.options.map((o, i) => (
              <OptionRow key={i} o={o} worst={worst} isPlayed={i === m.played} isBest={i === 0} playedLoss={charged ? shownLoss : null} t={t} lang={lang} />
            ))}
          </ul>
          <p className="rv-muted">
            {t.review.deltaHint} {t.review.evHint} {t.review.samples(Math.max(...m.options.map((o) => o.samples)))}
          </p>
        </details>
      )}
    </article>
  );
}

export interface ReviewTarget {
  hand: number;
  seat: Seat;
}

/**
 * The post-hand review: step through one player's decisions, each with the
 * position as they saw it, the move they played, the better move and why.
 */
export function ReviewScreen({
  reviews,
  start,
  seats,
  names,
  usThem,
  doneHands,
  onClose,
}: {
  reviews: HandReviews;
  start: ReviewTarget;
  /** Seats that can be reviewed on this device. */
  seats: readonly Seat[];
  names: string[];
  /** One person on this device: address them as "you". */
  usThem: boolean;
  /** Finished hands, ascending. */
  doneHands: number[];
  onClose: () => void;
}) {
  const t = useT();
  const { lang } = useSettings();
  const [target, setTarget] = useState<ReviewTarget>(start);
  const review: HandReview | null = useMemo(() => reviews.get(target.hand, target.seat), [reviews, target]);
  const moves = review?.moves ?? [];
  // Open on the costliest decision: that is what the player came to see.
  const firstInteresting = useMemo(() => {
    let worst = -1;
    let at = 0;
    moves.forEach((m, i) => {
      if (m.cls !== 'forced' && m.credited > worst) {
        worst = m.credited;
        at = i;
      }
    });
    return at;
  }, [moves]);
  const [step, setStep] = useState(0);
  useEffect(() => setStep(firstInteresting), [target.hand, target.seat, firstInteresting]);

  const k = Math.min(step, Math.max(0, moves.length - 1));
  const move = moves[k];
  const handAt = doneHands.indexOf(target.hand);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setStep((s) => Math.max(0, s - 1));
      else if (e.key === 'ArrowRight') setStep((s) => Math.min(moves.length - 1, s + 1));
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moves.length, onClose]);

  // Swipe left / right on the page to step through the moves.
  const swipe = useRef<{ x: number; y: number; t: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const p = e.touches[0];
    swipe.current = p && e.touches.length === 1 ? { x: p.clientX, y: p.clientY, t: Date.now() } : null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s0 = swipe.current;
    const p = e.changedTouches[0];
    swipe.current = null;
    if (!s0 || !p) return;
    const dx = p.clientX - s0.x;
    const dy = p.clientY - s0.y;
    if (Math.abs(dx) < 56 || Math.abs(dx) < 2 * Math.abs(dy) || Date.now() - s0.t > 600) return;
    setStep((s) => Math.max(0, Math.min(moves.length - 1, s + (dx < 0 ? 1 : -1))));
  };

  if (!isUnlocked('review')) {
    return (
      <div className="screen review">
        <ScreenHeader title={t.review.title} onBack={onClose} />
        <div className="scroll centered">
          <p className="warn soft">{t.review.locked}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="screen review">
      <ScreenHeader title={doneHands.length > 1 ? t.review.title : `${t.review.title} · ${t.review.hand(target.hand)}`} onBack={onClose} />
      <div className="rv-top">
        {doneHands.length > 1 && (
          <div className="rv-hands">
            <IconButton icon="back" label={t.review.prevHand} disabled={handAt <= 0} onClick={() => handAt > 0 && setTarget({ ...target, hand: doneHands[handAt - 1]! })} />
            <span>{t.review.hand(target.hand)}</span>
            <span className="rv-flip">
              <IconButton
                icon="back"
                label={t.review.nextHand}
                disabled={handAt >= doneHands.length - 1}
                onClick={() => handAt < doneHands.length - 1 && setTarget({ ...target, hand: doneHands[handAt + 1]! })}
              />
            </span>
          </div>
        )}
        {seats.length > 1 && (
          <Segmented options={seats.map((s) => ({ value: s, label: names[s]! }))} value={target.seat} onChange={(seat) => setTarget({ ...target, seat })} />
        )}
        <div className="rv-summary">
          <ScoreRing score={review?.score ?? null} busy={!review?.complete} size={60} />
          <div>
            <b>{usThem ? t.review.yourAccuracy : t.review.accuracyOf(names[target.seat]!)}</b>
            {review && review.complete ? <ClassCounts counts={review.counts} compact /> : <small>{t.review.analysing}</small>}
          </div>
        </div>
        <div className="rv-strip" role="tablist" aria-label={t.review.title}>
          {moves.map((m, i) => (
            <button
              key={m.index}
              type="button"
              role="tab"
              aria-selected={i === k}
              aria-label={`${t.review.moveOf(i + 1, moves.length)}: ${moveLabel(m, t)}`}
              className={`rv-step${i === k ? ' on' : ''}`}
              style={{ background: CLASS_STYLE[m.cls].color, color: CLASS_STYLE[m.cls].ink }}
              onClick={() => setStep(i)}
            >
              <small>{i + 1}</small>
              {m.even ? '=' : CLASS_STYLE[m.cls].symbol}
            </button>
          ))}
        </div>
      </div>

      <div className="scroll" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {move ? (
          <MoveDetail m={move} k={k + 1} n={moves.length} name={names[target.seat]!} usThem={usThem} names={names} t={t} lang={lang} />
        ) : (
          <p className="waiting">{t.review.analysing}</p>
        )}
        <p className="section-note">{t.review.assumption}</p>
      </div>

      <footer className="screen-footer rv-nav">
        <button type="button" className="btn" disabled={k <= 0} onClick={() => setStep(k - 1)}>
          ‹ {t.review.prev}
        </button>
        <button type="button" className="btn primary" disabled={k >= moves.length - 1} onClick={() => setStep(k + 1)}>
          {t.review.next} ›
        </button>
      </footer>
    </div>
  );
}
