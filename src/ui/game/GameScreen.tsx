import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { playSound, unlockAudio } from '../../audio/sound';
import { CardBack, CARD_STYLES } from '../../cards';
import {
  SETTEBELLO,
  capturesFor,
  legalMoves,
  rankOf,
  teamOf,
  type CardId,
  type PlayedMove,
  type Seat,
  type Team,
} from '../../engine';
import type { GameController } from '../../game/types';
import { useT } from '../../i18n';
import { overallScore } from '../../analysis/scoring';
import type { HandReview } from '../../analysis/types';
import { useHandReviews } from '../../analysis/useHandReviews';
import { TIMINGS } from '../../game/useDisplay';
import { isUnlocked } from '../../state/entitlements';
import { useSettings } from '../../state/settings';
import { Icon, IconButton, Modal, Segmented, Toggle } from '../common';
import { HowTo } from '../HowTo';
import { AccuracySummary, ScoreRing } from '../review/AccuracySummary';
import { ReviewScreen, type ReviewTarget } from '../review/ReviewScreen';
import { Board, type BoardMarks } from './Board';
import { HandEndDialog, LastTrickDialog, MatchEndDialog, ScoreboardDialog } from './Dialogs';
import { LastAction } from './LastAction';
import { computeGeometry } from './layout';
import { CardChip } from './MiniCards';

interface GameScreenProps {
  ctl: GameController;
  /** Leave the screen (a local game stays saved). */
  onExit: () => void;
  /** Local games only: delete the saved game and leave. */
  onAbandon?: () => void;
  onRematch?: () => void;
  /** Extra line in the menu (e.g. the online room code). */
  menuExtra?: ReactNode;
}

function useSize(): [React.RefObject<HTMLDivElement | null>, { w: number; h: number }] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

export function GameScreen({ ctl, onExit, onAbandon, onRematch, menuExtra }: GameScreenProps) {
  const t = useT();
  const { settings, update } = useSettings();
  const { view, perspective, seats } = ctl;
  const hand = view.hand;
  const [boardRef, size] = useSize();

  const [selected, setSelected] = useState<CardId | null>(null);
  /** Hand card under the thumb while it slides across the fan. */
  const [hover, setHover] = useState<CardId | null>(null);
  const [optIndex, setOptIndex] = useState(0);
  const timings = TIMINGS[settings.speed];
  const [dialog, setDialog] = useState<'menu' | 'score' | 'trick' | 'howto' | 'quit' | null>(null);

  const myTeam = teamOf(perspective);
  const names = seats.map((s) => s.name);
  const humanTeams = new Set(seats.map((s, i) => (s.kind === 'human' ? teamOf(i) : -1)).filter((x) => x >= 0));
  const usThem = !ctl.spectator && !(ctl.mode === 'pass' && humanTeams.size > 1);
  const teamNames = useMemo<[string, string]>(() => {
    if (usThem) return myTeam === 0 ? [t.common.us, t.common.them] : [t.common.them, t.common.us];
    return [`${names[0]} & ${names[2]}`, `${names[1]} & ${names[3]}`];
  }, [usThem, myTeam, t, names.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  const cols = { first: myTeam, names: teamNames };

  // ---- move analysis: accuracy after each hand and the review
  const reviews = useHandReviews(
    ctl.gameKey,
    view,
    ctl.reviewSeats,
    settings.review && isUnlocked('accuracy'),
    ctl.mode === 'online',
    // Do not compete with a computer player for the processor while it thinks.
    ctl.thinking !== null && view.phase === 'playing',
  );
  const [reviewing, setReviewing] = useState<ReviewTarget | null>(null);
  /** Hands that are over (only those may be reviewed: a hand in progress would show cards). */
  const doneHands = reviews.hands.filter((n) => n < view.handNumber || view.phase !== 'playing');
  const seatLabel = (seat: number) => (usThem ? t.review.yourAccuracy : t.review.accuracyOf(names[seat]!));
  const handReviews = (handNumber: number): HandReview[] =>
    reviews.enabled ? ctl.reviewSeats.flatMap((s) => reviews.get(handNumber, s) ?? []) : [];
  const openReview = (r: HandReview) => setReviewing({ hand: r.handNumber, seat: r.seat });
  /** The figure for the whole match, once every finished hand has been analysed in full (never a partial average). */
  const matchScores = ctl.reviewSeats.map((s) => {
    const perHand = doneHands.map((n) => reviews.get(n, s));
    const pending = perHand.some((r) => r !== null && !r.complete);
    return { seat: s, pending, score: pending ? null : overallScore(perHand.map((r) => r?.moves ?? [])) };
  });
  /** Short labels for the top bar and the piles. */
  const shortNames: [string, string] = usThem ? teamNames : [t.common.teamA, t.common.teamB];

  // Selection only makes sense while it is our turn.
  const canAct = ctl.canAct && view.phase === 'playing';
  useEffect(() => {
    if (!canAct && !ctl.busy) setSelected(null);
  }, [canAct, ctl.busy, hand.history.length, view.handNumber]);
  useEffect(() => setHover(null), [perspective, view.handNumber]);

  const myCards = hand.hands[perspective]!;
  // The card whose captures are previewed: the one under the thumb, else the selected one.
  const active = canAct ? (hover ?? selected) : null;
  const options = useMemo(
    () => (active !== null && myCards.includes(active) ? capturesFor(active, hand.table) : []),
    [active, hand.table, myCards],
  );
  const option = options.length > 0 ? options[hover !== null ? 0 : Math.min(optIndex, options.length - 1)]! : [];
  const choosing = canAct && selected !== null && hover === null;
  // A played card leaves the hand: forget the selection then, not before, so it
  // travels to the table from where it was instead of dropping back first.
  useEffect(() => {
    if (selected !== null && !myCards.includes(selected)) setSelected(null);
  }, [selected, myCards]);

  const play = () => {
    if (!choosing || selected === null) return;
    // The card stays lifted until it has actually left the hand (see the effect below).
    reviews.notePlayed(view.handNumber, hand.history.length, selected);
    ctl.play({ card: selected, capture: option });
  };
  // Holding and sliding across the hand lifts each card in turn (also when it is
  // not our turn, just to look); the card the thumb lifts from becomes selected.
  const onHandHover = (card: CardId | null) => {
    unlockAudio();
    if (card !== null) playSound('select');
    setHover(card);
  };
  const onHandPick = (card: CardId, tap: boolean) => {
    if (!canAct) return;
    if (tap && card === selected) {
      // A second tap puts the card back; playing always goes through the button.
      setSelected(null);
      return;
    }
    setSelected(card);
    setOptIndex(0);
  };
  const onTableTap = (card: CardId) => {
    if (options.length < 2) return;
    for (let k = 1; k <= options.length; k++) {
      const idx = (optIndex + k) % options.length;
      if (options[idx]!.includes(card)) {
        setOptIndex(idx);
        playSound('select');
        return;
      }
    }
  };

  // Tutorial: which of my cards can capture / sweep.
  const hints = useMemo(() => {
    if (!ctl.tutorial || !canAct) return { cap: [] as CardId[], sweep: [] as CardId[] };
    const cap = new Set<CardId>();
    const sweep = new Set<CardId>();
    for (const m of legalMoves(hand, perspective)) {
      if (m.capture.length > 0) cap.add(m.card);
      if (m.capture.length > 0 && m.capture.length === hand.table.length) sweep.add(m.card);
    }
    return { cap: [...cap], sweep: [...sweep] };
  }, [ctl.tutorial, canAct, hand, perspective]);

  // Each player's most recent action in this hand (only the latest one per seat is shown).
  const lastBySeat = useMemo(() => {
    const out: ({ move: PlayedMove; n: number } | null)[] = [null, null, null, null];
    hand.history.forEach((move, n) => {
      out[move.seat] = { move, n };
    });
    if (ctl.anim) out[ctl.anim.move.seat] = { move: ctl.anim.move, n: hand.history.length };
    return out;
  }, [hand.history, ctl.anim]);

  const marks: BoardMarks = {
    raised: hover ?? selected,
    strong: option,
    weak: options.flat().filter((c) => !option.includes(c)),
    hints: hints.cap,
    sweeps: hints.sweep,
  };

  const g = useMemo(
    () => (size.w > 0 ? computeGeometry(size.w, size.h, ctl.tutorial ? 58 : 0) : null),
    [size.w, size.h, ctl.tutorial],
  );

  // Turn chime when control comes to this device.
  const wasActing = useRef(false);
  useEffect(() => {
    if (canAct && !wasActing.current) playSound('turn');
    wasActing.current = canAct;
  }, [canAct]);

  // End of match jingle.
  const settledEnd = view.phase === 'matchEnd' && !ctl.busy;
  useEffect(() => {
    if (settledEnd) playSound(!usThem || view.winner === myTeam ? 'win' : 'lose');
  }, [settledEnd]); // eslint-disable-line react-hooks/exhaustive-deps

  // ----- status line
  const turnSeat = hand.turn;
  let status: string;
  // Start-of-hand gate: everybody looks at their cards and presses Ready.
  const gate = view.phase === 'playing' ? ctl.ready : null;
  if (view.phase !== 'playing') status = '';
  else if (ctl.busy && hand.history.length === 0) status = t.game.dealing;
  else if (gate) {
    const waitingFor = seats.filter((_, i) => !gate.seats[i]).map((s) => s.name);
    status = gate.canReady ? '' : t.game.waitingReady(waitingFor.join(', '));
  }
  else if (canAct) status = selected === null ? t.game.yourTurn : '';
  else if (ctl.thinking !== null) status = t.game.thinking(names[ctl.thinking]!);
  else if (turnSeat === perspective && usThem) status = t.game.yourTurn;
  else status = t.game.turnOf(names[turnSeat]!);

  // ----- tutorial coach
  let coach: string | null = null;
  if (ctl.tutorial && view.phase === 'playing' && ctl.passTo === null) {
    if (gate) coach = gate.canReady ? t.tutorial.ready : t.tutorial.wait;
    else if (!canAct) coach = t.tutorial.wait;
    else if (active === null) {
      if (hints.sweep.length > 0) coach = t.tutorial.canScopa;
      else if (hints.cap.some((c) => capturesFor(c, hand.table).some((o) => o.includes(SETTEBELLO)))) coach = t.tutorial.settebello;
      else if (hints.cap.length > 0) coach = t.tutorial.canCapture;
      else coach = t.tutorial.noCapture;
    } else if (options.length === 0) coach = t.tutorial.selectedLay;
    else if (options.length > 1) coach = t.tutorial.selectedMulti;
    else if (option.length === hand.table.length) coach = t.tutorial.selectedScopa;
    else if (option.length === 1 && rankOf(option[0]!) === rankOf(active)) coach = `${t.tutorial.selectedRank} ${t.tutorial.confirm}`;
    else coach = `${t.tutorial.selectedSum} ${t.tutorial.confirm}`;
  }

  const showHandEnd = view.phase === 'handEnd' && !ctl.busy;
  const showMatchEnd = view.phase === 'matchEnd' && !ctl.busy;

  const scopaSeat = ctl.scopa;

  return (
    <div
      className={`game${settings.largeText ? ' large-text' : ''}`}
      style={{ '--move': `${timings.move}ms` } as React.CSSProperties}
      onPointerDown={unlockAudio}
    >
      <header className="topbar">
        <IconButton icon="menu" label={t.game.menu} onClick={() => setDialog('menu')} />
        <button type="button" className="score-pill" onClick={() => setDialog('score')} aria-label={t.game.scoreboard}>
          <span className="sp-team">
            <span className="sp-name">{shortNames[myTeam]}</span>
            <span className="sp-num">{view.scores[myTeam]}</span>
          </span>
          <span className="sp-mid">
            <span>{t.game.hand(view.handNumber)}</span>
            <span className="sp-target">→ {view.rules.target}</span>
          </span>
          <span className="sp-team">
            <span className="sp-num">{view.scores[1 - myTeam]}</span>
            <span className="sp-name">{shortNames[1 - myTeam]}</span>
          </span>
        </button>
        <IconButton icon="eye" label={t.game.lastTrick} onClick={() => setDialog('trick')} />
        <IconButton
          icon={settings.sound ? 'sound' : 'mute'}
          label={settings.sound ? t.game.mute : t.game.unmute}
          onClick={() => update({ sound: !settings.sound })}
        />
      </header>

      {ctl.notice && <div className="notice">{ctl.notice}</div>}

      <div className="board" ref={boardRef}>
        {g && (
          <>
            <div
              className="table-felt"
              style={{ left: g.table.x - 4, top: g.table.y - 6, width: g.table.w + 8, height: g.table.h + 12 }}
            />
            {/* capture piles */}
            {[0, 1].map((k) => {
              const team = (k === 0 ? myTeam : 1 - myTeam) as Team;
              const count = hand.captured[team].length;
              const p = g.pile[k]!;
              const w = g.cw * g.pileScale;
              const h = g.ch * g.pileScale;
              return (
                <div
                  key={k}
                  className={`pile pile-${k}`}
                  style={k === 0 ? { right: g.W - p.x - w / 2, top: p.y - h / 2 } : { left: p.x - w / 2, top: p.y - h / 2 }}
                >
                  <div className={`pile-stack${count === 0 ? ' empty' : ''}`} style={{ width: w, height: h }}>
                    {count > 0 && <CardBack style={settings.cardStyle} />}
                    <span className="pile-count">{count}</span>
                  </div>
                  <div className="pile-info">
                    <span className="pile-label">{usThem ? teamNames[team] : team === 0 ? 'A' : 'B'}</span>
                    {hand.scope[team] > 0 && (
                      <span className="pile-scope" title={t.game.scopeShort}>
                        {t.game.scopeShort} {hand.scope[team]}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* the other three players */}
            {[1, 2, 3].map((r) => {
              const seat = ((perspective + r) & 3) as Seat;
              const info = seats[seat]!;
              const c = g.seat[r]!;
              const fanHalf = r === 2 ? (g.ch * g.otherScale) / 2 : 62;
              const style =
                r === 2
                  ? { left: c.x, top: c.y + fanHalf + 3 }
                  : r === 1
                    ? { right: 4, top: c.y - fanHalf - 30 }
                    : { left: 4, top: c.y - fanHalf - 30 };
              return (
                <div
                  key={seat}
                  className={`seat-badge rel-${r}${hand.turn === seat && view.phase === 'playing' ? ' turn' : ''}${teamOf(seat) === myTeam ? ' mate' : ''}`}
                  style={style}
                >
                  <span className="seat-name">{info.name}</span>
                  <span className="seat-meta">
                    {info.away ? <i className="tag away">{t.game.awayTag}</i> : info.kind === 'ai' ? <i className="tag">{t.game.aiTag}</i> : null}
                    {hand.dealer === seat && <i className="tag dealer" title={t.game.dealer}>M</i>}
                    {gate && !ctl.busy && info.kind === 'human' && !info.away && (
                      <i className={`tag ${gate.seats[seat] ? 'ready' : 'wait'}`}>{gate.seats[seat] ? '✓' : '…'}</i>
                    )}
                    <b>{hand.hands[seat]!.length}</b>
                  </span>
                </div>
              );
            })}

            {/* what each of them did on their last turn */}
            {[1, 2, 3].map((r) => {
              const seat = (perspective + r) & 3;
              const last = lastBySeat[seat];
              if (!last) return null;
              const c = g.seat[r]!;
              const colW = g.ch * g.otherScale + 6;
              const style =
                r === 2
                  ? { left: g.W / 2 + 78, right: 6, top: 4 }
                  : r === 1
                    ? { right: 3, top: c.y + 62, width: colW }
                    : { left: 3, top: c.y + 62, width: colW };
              return (
                <LastAction
                  key={`${seat}-${last.n}`}
                  move={last.move}
                  cardStyle={settings.cardStyle}
                  scopaLabel={t.game.scopa}
                  label={t.game.lastActionOf(names[seat]!)}
                  variant={r === 2 ? 'row' : 'col'}
                  large={settings.largeText}
                  style={style}
                />
              );
            })}

            <Board
              view={view}
              anim={ctl.anim}
              perspective={perspective}
              g={g}
              cardStyle={settings.cardStyle}
              showIndex={settings.showIndex}
              largeIndex={settings.largeText}
              interactive={canAct}
              marks={marks}
              dealStep={timings.dealStep}
              onHandHover={onHandHover}
              onHandPick={onHandPick}
              onTableTap={onTableTap}
            />

            {scopaSeat && (
              <div key={scopaSeat.key} className="scopa-banner" style={{ top: g.table.y + g.table.h / 2 }}>
                <span>{t.game.scopa}</span>
                <small>{names[scopaSeat.seat]}</small>
              </div>
            )}

            {coach && (
              <div className="coach" style={{ bottom: g.handZone + g.actionH + 4 }}>
                <Icon name="bulb" size={18} />
                <p>{coach}</p>
                <button type="button" aria-label={t.tutorial.off} onClick={() => ctl.setTutorial(false)}>
                  <Icon name="close" size={16} />
                </button>
              </div>
            )}

            {/* action bar */}
            <div
              className={`action-bar${choosing ? ' choosing' : ''}`}
              style={{ bottom: g.handZone, height: g.actionH }}
            >
              {choosing ? (
                <>
                  {options.length > 1 && (
                    <div className="options" aria-label={t.game.chooseCapture}>
                      {options.map((opt, i) => (
                        <button
                          key={opt.join('-')}
                          type="button"
                          className={`option${i === optIndex ? ' on' : ''}`}
                          onClick={() => setOptIndex(i)}
                        >
                          {opt.map((c) => (
                            <CardChip key={c} card={c} cardStyle={settings.cardStyle} />
                          ))}
                        </button>
                      ))}
                    </div>
                  )}
                  <button type="button" className="btn primary play-btn" onClick={play}>
                    {options.length > 0 ? t.game.take : t.game.lay}
                  </button>
                </>
              ) : (
                <div className="me-col">
                  {lastBySeat[perspective] && (
                    <LastAction
                      key={lastBySeat[perspective]!.n}
                      move={lastBySeat[perspective]!.move}
                      cardStyle={settings.cardStyle}
                      scopaLabel={t.game.scopa}
                      label={t.game.lastActionOf(names[perspective]!)}
                      variant="me"
                      large={settings.largeText}
                    />
                  )}
                  {gate && gate.canReady && !ctl.busy ? (
                    <button type="button" className="btn primary ready-btn" onClick={ctl.readyUp}>
                      {t.game.ready}
                    </button>
                  ) : (
                    <div className={`status${canAct ? ' mine' : ''}`}>
                      {hand.dealer === perspective && view.phase === 'playing' && <i className="tag dealer">M</i>}
                      <span>{status}</span>
                      {ctl.spectator && <small>{t.game.spectating}</small>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {ctl.passTo !== null && view.phase === 'playing' && (
        <div className="pass-screen">
          <Icon name="phone" size={56} />
          <p className="eyebrow">{t.pass.title}</p>
          <h2>{gate ? t.pass.look(names[ctl.passTo]!) : t.pass.to(names[ctl.passTo]!)}</h2>
          <p>{t.pass.body}</p>
          <button type="button" className="btn primary big" onClick={() => { unlockAudio(); ctl.reveal(); }}>
            {t.pass.reveal}
          </button>
        </div>
      )}

      {showHandEnd && (
        <HandEndDialog
          view={view}
          cols={cols}
          t={t}
          cardStyle={settings.cardStyle}
          canContinue={ctl.canContinue}
          onContinue={ctl.continueAfterHand}
          waitingText={t.game.waitingHost}
          accuracy={<AccuracySummary reviews={handReviews(view.handNumber)} label={seatLabel} onOpen={openReview} />}
        />
      )}
      {showMatchEnd && (
        <MatchEndDialog
          view={view}
          cols={cols}
          t={t}
          usThem={usThem}
          onRematch={onRematch}
          onHome={onAbandon ?? onExit}
          accuracy={
            reviews.enabled && doneHands.length > 0 ? (
              <>
                {doneHands.length > 1 && (
                  <div className="match-accuracy">
                    {matchScores.map((m) => (
                      <span key={m.seat}>
                        <ScoreRing score={m.score} size={44} busy={m.pending} />
                        <small>{usThem ? t.review.matchAccuracy : names[m.seat]}</small>
                      </span>
                    ))}
                  </div>
                )}
                <AccuracySummary reviews={handReviews(view.handNumber)} label={seatLabel} onOpen={openReview} />
              </>
            ) : undefined
          }
        />
      )}

      {dialog === 'score' && (
        <ScoreboardDialog
          view={view}
          cols={cols}
          t={t}
          onClose={() => setDialog(null)}
          footer={
            reviews.enabled && doneHands.length > 0 && ctl.reviewSeats.length > 0 ? (
              <button
                type="button"
                className="btn wide"
                onClick={() => {
                  setDialog(null);
                  setReviewing({ hand: doneHands[doneHands.length - 1]!, seat: ctl.reviewSeats[0]! });
                }}
              >
                {t.review.openAll}
              </button>
            ) : undefined
          }
        />
      )}
      {dialog === 'trick' && (
        <LastTrickDialog
          view={view}
          names={names}
          me={usThem ? perspective : null}
          t={t}
          cardStyle={settings.cardStyle}
          showIndex={settings.showIndex}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'menu' && (
        <Modal sheet onClose={() => setDialog(null)} label={t.game.menu} className="menu-sheet">
          <h2>{t.game.menu}</h2>
          {menuExtra}
          <div className="card-panel">
            <Toggle label={t.settings.sound} checked={settings.sound} onChange={(v) => update({ sound: v })} />
            <Toggle label={t.setup.tutorial} hint={t.setup.tutorialHint} checked={ctl.tutorial} onChange={ctl.setTutorial} />
            <Toggle label={t.settings.showIndex} checked={settings.showIndex} onChange={(v) => update({ showIndex: v })} />
            <Toggle label={t.settings.largeText} hint={t.settings.largeTextHint} checked={settings.largeText} onChange={(v) => update({ largeText: v })} />
            <Toggle label={t.review.settingLabel} checked={settings.review} onChange={(v) => update({ review: v })} />
            <div className="row col">
              <span className="row-label">{t.settings.speed}</span>
              <Segmented
                options={[
                  { value: 'slow', label: t.settings.speedSlow },
                  { value: 'normal', label: t.settings.speedNormal },
                  { value: 'fast', label: t.settings.speedFast },
                ]}
                value={settings.speed}
                onChange={(speed) => update({ speed })}
              />
            </div>
            <div className="row col">
              <span className="row-label">{t.settings.cardStyle}</span>
              <Segmented
                options={CARD_STYLES.map((s) => ({ value: s, label: t.settings.styles[s] }))}
                value={settings.cardStyle}
                onChange={(v) => update({ cardStyle: v })}
              />
            </div>
          </div>
          <div className="btn-col">
            <button type="button" className="btn primary wide" onClick={() => setDialog(null)}>
              {t.game.resume}
            </button>
            <button type="button" className="btn wide" onClick={() => setDialog('howto')}>
              {t.home.howTo}
            </button>
            <button type="button" className="btn wide danger" onClick={() => setDialog('quit')}>
              {t.game.quit}
            </button>
          </div>
        </Modal>
      )}
      {dialog === 'quit' && (
        <Modal onClose={() => setDialog(null)} label={t.game.quit}>
          <h2>{t.game.quit}</h2>
          <p>{ctl.mode === 'online' ? t.game.quitOnlineConfirm : t.game.quitConfirm}</p>
          <div className="btn-col">
            <button type="button" className="btn primary wide" onClick={onExit}>
              {t.game.quit}
            </button>
            {onAbandon && (
              <button type="button" className="btn wide danger" onClick={onAbandon}>
                {t.game.abandon}
              </button>
            )}
            <button type="button" className="btn wide" onClick={() => setDialog(null)}>
              {t.common.cancel}
            </button>
          </div>
        </Modal>
      )}
      {reviewing && (
        <div className="overlay-screen">
          <ReviewScreen
            reviews={reviews}
            start={reviewing}
            seats={ctl.reviewSeats}
            names={names}
            usThem={usThem}
            doneHands={doneHands}
            onClose={() => setReviewing(null)}
          />
        </div>
      )}
      {dialog === 'howto' && (
        <div className="overlay-screen">
          <HowTo onBack={() => setDialog(null)} />
        </div>
      )}
    </div>
  );
}
