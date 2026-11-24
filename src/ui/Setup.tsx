import { useState } from 'react';
import { AI_LEVELS, type AiLevel } from '../ai/types';
import { AI_NAMES, defaultSeats } from '../game/setup';
import type { LocalMode, SeatConfig } from '../game/types';
import { useT } from '../i18n';
import { useSettings } from '../state/settings';
import { Icon, Modal, ScreenHeader, Section, Segmented, Toggle } from './common';
import { RulesEditor } from './RulesEditor';

interface SetupProps {
  mode: LocalMode;
  hasSaved: boolean;
  onBack: () => void;
  onStart: (seats: SeatConfig[], tutorial: boolean) => void;
}

/** Order in which seats are listed: partners together. */
const TEAM_ROWS: [number, number][] = [
  [0, 2],
  [1, 3],
];

export function Setup({ mode, hasSaved, onBack, onStart }: SetupProps) {
  const t = useT();
  const { settings, update, updateRules } = useSettings();
  const [seats, setSeats] = useState<SeatConfig[]>(() =>
    defaultSeats(mode, settings.playerName.trim(), t.common.you, t.common.player),
  );
  const [tutorial, setTutorial] = useState(false);
  const [offer, setOffer] = useState(false);

  const posNames = [t.seats.south, t.seats.east, t.seats.north, t.seats.west];
  const humans = seats.filter((s) => s.kind === 'human').length;
  const valid = mode === 'ai' || humans >= 2;

  const patch = (i: number, p: Partial<SeatConfig>) =>
    setSeats((prev) => prev.map((s, k) => (k === i ? { ...s, ...p } : s)));

  const setKind = (i: number, kind: 'human' | 'ai') => {
    const n = seats.slice(0, i + 1).filter((s, k) => k === i || s.kind === 'human').length;
    patch(i, {
      kind,
      name: kind === 'ai' ? AI_NAMES[i]! : i === 0 && settings.playerName.trim() ? settings.playerName.trim() : t.common.player(n),
    });
  };

  const begin = (withTutorial: boolean) => {
    const cleaned = seats.map((s, i) => ({
      ...s,
      name: s.name.trim().slice(0, 14) || (s.kind === 'ai' ? AI_NAMES[i]! : t.common.player(i + 1)),
    }));
    update({ tutorialOffered: true });
    onStart(cleaned, withTutorial);
  };

  const start = () => {
    if (!valid) return;
    if (!settings.tutorialOffered && !tutorial) setOffer(true);
    else begin(tutorial);
  };

  return (
    <div className="screen">
      <ScreenHeader title={mode === 'ai' ? t.setup.titleAi : t.setup.titlePass} onBack={onBack} />
      <div className="scroll">
        <section className="section">
          <h2>{t.setup.players}</h2>
          <p className="section-note top">{t.setup.playersHint}</p>
          {TEAM_ROWS.map((pair, ti) => (
            <div key={ti} className={`card-panel team-panel team-${ti}`}>
              <div className="team-title">{ti === 0 ? t.common.teamA : t.common.teamB}</div>
              {pair.map((i) => {
                const s = seats[i]!;
                return (
                  <div key={i} className="seat-row">
                    <div className="seat-row-head">
                      <span className="seat-pos">
                        <Icon name={s.kind === 'human' ? 'person' : 'robot'} size={18} /> {posNames[i]}
                      </span>
                      <Segmented
                        label={posNames[i]}
                        options={[
                          { value: 'human', label: t.common.human },
                          { value: 'ai', label: t.common.computer },
                        ]}
                        value={s.kind}
                        onChange={(kind) => setKind(i, kind)}
                      />
                    </div>
                    {s.kind === 'human' ? (
                      <input
                        className="text-input"
                        type="text"
                        maxLength={14}
                        autoComplete="off"
                        autoCapitalize="words"
                        aria-label={`${t.setup.name} ${posNames[i]}`}
                        placeholder={t.setup.name}
                        value={s.name}
                        onChange={(e) => patch(i, { name: e.target.value })}
                      />
                    ) : (
                      <Segmented<AiLevel>
                        label={`${t.setup.level} ${posNames[i]}`}
                        options={AI_LEVELS.map((l) => ({ value: l, label: t.levels[l].split(' ')[0]! }))}
                        value={s.level}
                        onChange={(level) => patch(i, { level })}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </section>

        <Section title={t.setup.rules}>
          <RulesEditor rules={settings.rules} onChange={updateRules} />
        </Section>

        <Section>
          <Toggle label={t.setup.tutorial} hint={t.setup.tutorialHint} checked={tutorial} onChange={setTutorial} />
        </Section>

        {!valid && <p className="warn">{t.setup.needHuman}</p>}
        {hasSaved && <p className="section-note">{t.setup.replaceSaved}</p>}
      </div>
      <footer className="screen-footer">
        <button type="button" className="btn primary wide big" disabled={!valid} onClick={start}>
          {t.setup.start}
        </button>
      </footer>

      {offer && (
        <Modal label={t.tutorial.offerTitle}>
          <h2>{t.tutorial.offerTitle}</h2>
          <p>{t.tutorial.offerBody}</p>
          <div className="btn-col">
            <button type="button" className="btn primary wide" onClick={() => begin(true)}>
              {t.tutorial.offerYes}
            </button>
            <button type="button" className="btn wide" onClick={() => begin(false)}>
              {t.tutorial.offerNo}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
