import type { CardStyle } from '../../cards';
import { SCORE_CATEGORIES, type HandScore, type MatchState, type ScoreCategory, type Team } from '../../engine';
import type { Dict } from '../../i18n';
import { Icon, Modal } from '../common';
import { MiniCards } from './MiniCards';

interface TeamCols {
  /** Team shown in the first column. */
  first: Team;
  names: [string, string];
}

function detailFor(cat: ScoreCategory, score: HandScore, team: Team): string {
  const d = score.detail[team];
  switch (cat) {
    case 'carte':
      return String(d.cards);
    case 'denari':
      return String(d.denari);
    case 'settebello':
      return d.settebello ? '✓' : '–';
    case 'primiera':
      return String(d.primiera);
    case 'scope':
      return String(d.scope);
    case 'reBello':
      return d.reBello ? '✓' : '–';
    case 'napola':
      return d.napola > 0 ? `1–${d.napola}` : '–';
  }
}

export function ScoreTable({ score, cols, t, rules }: { score: HandScore; cols: TeamCols; t: Dict; rules: MatchState['rules'] }) {
  const order: Team[] = [cols.first, (1 - cols.first) as Team];
  const cats = SCORE_CATEGORIES.filter((c) => (c === 'reBello' ? rules.reBello : c === 'napola' ? rules.napola : true));
  return (
    <table className="score-table">
      <thead>
        <tr>
          <th>{t.score.category}</th>
          {order.map((team) => (
            <th key={team}>{cols.names[team]}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {cats.map((cat) => (
          <tr key={cat}>
            <td>{t.score[cat]}</td>
            {order.map((team) => {
              const pts = score.points[cat][team];
              return (
                <td key={team} className={pts > 0 ? 'won' : ''}>
                  <span className="detail">{detailFor(cat, score, team)}</span>
                  <span className={`pts${pts > 0 ? ' on' : ''}`}>{pts > 0 ? `+${pts}` : ''}</span>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>{t.score.handTotal}</td>
          {order.map((team) => (
            <td key={team}>
              <span className="pts total">{score.total[team]}</span>
            </td>
          ))}
        </tr>
      </tfoot>
    </table>
  );
}

export function HandEndDialog({
  view,
  cols,
  t,
  cardStyle,
  canContinue,
  onContinue,
  waitingText,
}: {
  view: MatchState;
  cols: TeamCols;
  t: Dict;
  cardStyle: CardStyle;
  canContinue: boolean;
  onContinue: () => void;
  waitingText: string;
}) {
  const score = view.handScores[view.handScores.length - 1]!;
  const order: Team[] = [cols.first, (1 - cols.first) as Team];
  const left = view.hand.leftover;
  const tied = view.scores[0] === view.scores[1] && view.scores[0] >= view.rules.target;
  return (
    <Modal className="hand-end" label={t.score.handOver(view.handNumber)}>
      <h2>{t.score.handOver(view.handNumber)}</h2>
      <ScoreTable score={score} cols={cols} t={t} rules={view.rules} />
      <div className="primiera-detail">
        <span className="caption">{t.score.primieraDetail}</span>
        <div className="primiera-rows">
          {order.map((team) => (
            <div key={team}>
              <MiniCards cards={score.detail[team].primieraCards} cardStyle={cardStyle} width={26} />
            </div>
          ))}
        </div>
      </div>
      {left && left.team !== null && left.cards.length > 0 && (
        <p className="note">{t.score.leftover(cols.names[left.team], left.cards.length)}</p>
      )}
      <div className="running">
        <span>{t.score.total}</span>
        <div className="running-scores">
          {order.map((team) => (
            <div key={team} className="running-team">
              <span className="big">{view.scores[team]}</span>
              <span className="who">{cols.names[team]}</span>
            </div>
          ))}
        </div>
        <span className="target">{t.score.target(view.rules.target)}</span>
      </div>
      {tied && <p className="note strong">{t.score.tieBreak}</p>}
      {canContinue ? (
        <button type="button" className="btn primary wide" onClick={onContinue}>
          {t.score.nextHand}
        </button>
      ) : (
        <p className="note waiting">{waitingText}</p>
      )}
    </Modal>
  );
}

export function MatchEndDialog({
  view,
  cols,
  t,
  usThem,
  onRematch,
  onHome,
}: {
  view: MatchState;
  cols: TeamCols;
  t: Dict;
  usThem: boolean;
  onRematch?: () => void;
  onHome: () => void;
}) {
  const winner = view.winner ?? 0;
  const order: Team[] = [cols.first, (1 - cols.first) as Team];
  const won = winner === cols.first;
  const title = usThem ? (won ? t.score.youWin : t.score.youLose) : t.score.teamWins(cols.names[winner]);
  const score = view.handScores[view.handScores.length - 1]!;
  return (
    <Modal className={`match-end ${won || !usThem ? 'won' : 'lost'}`} label={t.score.matchOver}>
      <p className="eyebrow">{t.score.matchOver}</p>
      <h2>{title}</h2>
      <div className="running final">
        <div className="running-scores">
          {order.map((team) => (
            <div key={team} className={`running-team${team === winner ? ' winner' : ''}`}>
              <span className="big">{view.scores[team]}</span>
              <span className="who">{cols.names[team]}</span>
            </div>
          ))}
        </div>
      </div>
      <details className="last-hand">
        <summary>{t.score.handOver(view.handNumber)}</summary>
        <ScoreTable score={score} cols={cols} t={t} rules={view.rules} />
      </details>
      <div className="btn-col">
        {onRematch && (
          <button type="button" className="btn primary wide" onClick={onRematch}>
            {t.score.rematch}
          </button>
        )}
        <button type="button" className={`btn wide${onRematch ? '' : ' primary'}`} onClick={onHome}>
          {t.score.home}
        </button>
      </div>
    </Modal>
  );
}

export function ScoreboardDialog({ view, cols, t, onClose }: { view: MatchState; cols: TeamCols; t: Dict; onClose: () => void }) {
  const order: Team[] = [cols.first, (1 - cols.first) as Team];
  let run: [number, number] = [0, 0];
  return (
    <Modal onClose={onClose} label={t.game.scoreboard} className="scoreboard">
      <button type="button" className="modal-x" aria-label={t.common.close} onClick={onClose}>
        <Icon name="close" size={20} />
      </button>
      <h2>{t.game.scoreboard}</h2>
      <p className="caption">
        {t.rules[view.rules.variant]} · {t.score.target(view.rules.target)}
      </p>
      {view.handScores.length === 0 ? (
        <p className="note">{t.score.noHands}</p>
      ) : (
        <table className="score-table history">
          <thead>
            <tr>
              <th />
              {order.map((team) => (
                <th key={team}>{cols.names[team]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.handScores.map((hs, i) => {
              run = [run[0] + hs.total[0], run[1] + hs.total[1]];
              const snap = run;
              return (
                <tr key={i}>
                  <td>{t.score.handN(i + 1)}</td>
                  {order.map((team) => (
                    <td key={team}>
                      <span className="detail">+{hs.total[team]}</span>
                      <span className="pts total">{snap[team]}</span>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className="running">
        <div className="running-scores">
          {order.map((team) => (
            <div key={team} className="running-team">
              <span className="big">{view.scores[team]}</span>
              <span className="who">{cols.names[team]}</span>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

export function LastTrickDialog({
  view,
  names,
  me,
  t,
  cardStyle,
  showIndex,
  onClose,
}: {
  view: MatchState;
  names: string[];
  /** The seat to address as "you" (null when watching or sharing the phone). */
  me: number | null;
  t: Dict;
  cardStyle: CardStyle;
  showIndex: boolean;
  onClose: () => void;
}) {
  const history = view.hand.history;
  let capture = null;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]!.captured.length > 0) {
      capture = history[i]!;
      break;
    }
  }
  const lastPlay = history.length > 0 ? history[history.length - 1]! : null;
  return (
    <Modal onClose={onClose} label={t.game.lastTrick} className="last-trick">
      <button type="button" className="modal-x" aria-label={t.common.close} onClick={onClose}>
        <Icon name="close" size={20} />
      </button>
      <h2>{t.game.lastTrick}</h2>
      {capture ? (
        <div className="trick">
          <p>{capture.seat === me ? t.game.lastTrickYou : t.game.lastTrickBy(names[capture.seat]!)}</p>
          <MiniCards cards={[capture.card]} cardStyle={cardStyle} width={58} showIndex={showIndex} />
          <p>{capture.seat === me ? t.game.lastTrickYouTook : t.game.lastTrickTook}</p>
          <MiniCards cards={capture.captured} cardStyle={cardStyle} width={capture.captured.length > 4 ? 40 : 58} showIndex={showIndex} />
          {capture.scopa && <p className="scopa-tag">{t.game.scopa}</p>}
        </div>
      ) : (
        <p className="note">{t.game.lastTrickNone}</p>
      )}
      {lastPlay && lastPlay !== capture && (
        <div className="trick minor">
          <h3>{t.game.lastPlay}</h3>
          <p>
            {lastPlay.seat === me ? t.game.lastTrickYou : t.game.lastTrickBy(names[lastPlay.seat]!)} <MiniCards cards={[lastPlay.card]} cardStyle={cardStyle} width={34} showIndex={showIndex} />{' '}
            {lastPlay.seat === me ? t.game.youLaidDown : t.game.laidDown}
          </p>
        </div>
      )}
    </Modal>
  );
}
