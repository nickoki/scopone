import type { HandReview } from '../../analysis/types';
import { useT } from '../../i18n';
import { useSettings } from '../../state/settings';
import { isUnlocked } from '../../state/entitlements';
import { Icon } from '../common';
import { CLASS_STYLE, SUMMARY_CLASSES, scoreColor } from './classes';

/** The score out of 10 in a ring that fills with it. */
export function ScoreRing({ score, size = 56, busy }: { score: number | null; size?: number; busy?: boolean }) {
  const { lang } = useSettings();
  const text = score === null ? '' : score.toFixed(1).replace('.', lang === 'it' ? ',' : '.');
  const r = 20;
  const c = 2 * Math.PI * r;
  const frac = score === null ? 0 : Math.max(0, Math.min(1, score / 10));
  return (
    <svg className={`score-ring${busy ? ' busy' : ''}`} width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={score === null ? '…' : `${text} / 10`}>
      <circle cx="24" cy="24" r={r} fill="none" stroke="rgba(58,33,20,0.14)" strokeWidth="5" />
      {score !== null && (
        <circle
          cx="24"
          cy="24"
          r={r}
          fill="none"
          stroke={scoreColor(score)}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${c * frac} ${c}`}
          transform="rotate(-90 24 24)"
        />
      )}
      {busy && <circle className="ring-spin" cx="24" cy="24" r={r} fill="none" stroke="#b8482c" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${c * 0.2} ${c}`} />}
      <text x="24" y="29" textAnchor="middle" className="ring-text">
        {score === null ? (busy ? '' : '–') : text}
      </text>
    </svg>
  );
}

export function ClassCounts({ counts, compact }: { counts: HandReview['counts']; compact?: boolean }) {
  const t = useT();
  return (
    <span className="class-counts">
      {SUMMARY_CLASSES.filter((c) => counts[c] > 0).map((c) => (
        <span key={c} className="class-count" title={t.review.classes[c]}>
          <i style={{ background: CLASS_STYLE[c].color, color: CLASS_STYLE[c].ink }}>{CLASS_STYLE[c].symbol}</i>
          {compact ? counts[c] : `${counts[c]} ${t.review.classes[c]}`}
        </span>
      ))}
    </span>
  );
}

/**
 * One line per person who played on this device: their accuracy for the hand
 * and the way into the review. Shown on the hand-end and match-end screens.
 */
export function AccuracySummary({
  reviews,
  label,
  onOpen,
}: {
  reviews: HandReview[];
  /** Heading for a seat (e.g. "Your accuracy" or "Anna's accuracy"). */
  label: (seat: number) => string;
  onOpen: (review: HandReview) => void;
}) {
  const t = useT();
  if (reviews.length === 0) return null;
  const canReview = isUnlocked('review');
  return (
    <div className="accuracy-block">
      {reviews.map((r) => {
        const decisions = r.moves.filter((m) => m.cls !== 'forced').length;
        const allAuto = r.moves.length > 0 && r.moves.every((m) => m.auto);
        return (
          <button key={r.seat} type="button" className="accuracy-row" disabled={!r.complete} onClick={() => onOpen(r)}>
            <ScoreRing score={r.score} busy={!r.complete} />
            <span className="accuracy-text">
              <b>{label(r.seat)}</b>
              {!r.complete ? (
                <small>{t.review.analysingN(r.moves.length, r.total)}</small>
              ) : decisions === 0 ? (
                <small>{allAuto ? t.review.allAuto : t.review.noDecisions}</small>
              ) : (
                <ClassCounts counts={r.counts} compact />
              )}
              {r.complete && (
                <small className="accuracy-cta">
                  {canReview ? t.review.open : `${t.review.premium} · ${t.review.open}`}
                </small>
              )}
            </span>
            {r.complete && <Icon name="chevron" size={18} />}
          </button>
        );
      })}
    </div>
  );
}
