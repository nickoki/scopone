import { CARD_STYLES } from '../cards';
import { cardId } from '../engine';
import { useT } from '../i18n';
import { DEFAULT_SETTINGS, useSettings, type LanguageSetting } from '../state/settings';
import { ScreenHeader, Section, Segmented, Toggle } from './common';
import { MiniCards } from './game/MiniCards';
import { RulesEditor } from './RulesEditor';

export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const t = useT();
  const { settings, update, updateRules } = useSettings();
  const sample = [cardId('denari', 7), cardId('coppe', 1), cardId('spade', 9), cardId('bastoni', 10)];
  return (
    <div className="screen">
      <ScreenHeader title={t.settings.title} onBack={onBack} />
      <div className="scroll">
        <Section>
          <div className="row col">
            <span className="row-label">{t.settings.language}</span>
            <Segmented<LanguageSetting>
              label={t.settings.language}
              options={[
                { value: 'auto', label: t.settings.languageAuto },
                { value: 'it', label: 'Italiano' },
                { value: 'en', label: 'English' },
              ]}
              value={settings.language}
              onChange={(language) => update({ language })}
            />
          </div>
          <label className="row col">
            <span className="row-label">{t.settings.yourName}</span>
            <input
              className="text-input"
              type="text"
              maxLength={14}
              autoComplete="off"
              autoCapitalize="words"
              placeholder={t.settings.namePlaceholder}
              value={settings.playerName}
              onChange={(e) => update({ playerName: e.target.value })}
            />
          </label>
        </Section>

        <Section title={t.settings.cards}>
          <div className="row col">
            <span className="row-label">{t.settings.cardStyle}</span>
            <Segmented
              label={t.settings.cardStyle}
              options={CARD_STYLES.map((s) => ({ value: s, label: t.settings.styles[s] }))}
              value={settings.cardStyle}
              onChange={(cardStyle) => update({ cardStyle })}
            />
            <div className="style-preview">
              <MiniCards cards={sample} cardStyle={settings.cardStyle} width={62} showIndex={settings.showIndex} />
            </div>
          </div>
          <Toggle
            label={t.settings.showIndex}
            hint={t.settings.showIndexHint}
            checked={settings.showIndex}
            onChange={(showIndex) => update({ showIndex })}
          />
          <Toggle
            label={t.settings.largeText}
            hint={t.settings.largeTextHint}
            checked={settings.largeText}
            onChange={(largeText) => update({ largeText })}
          />
        </Section>

        <Section title={t.settings.gameRules} note={t.settings.rulesNote}>
          <RulesEditor rules={settings.rules} onChange={updateRules} />
        </Section>

        <Section>
          <Toggle label={t.settings.sound} checked={settings.sound} onChange={(sound) => update({ sound })} />
          <div className="row col">
            <span className="row-text">
              <span className="row-label">{t.settings.speed}</span>
              <span className="row-hint">{t.settings.speedHint}</span>
            </span>
            <Segmented
              label={t.settings.speed}
              options={[
                { value: 'slow', label: t.settings.speedSlow },
                { value: 'normal', label: t.settings.speedNormal },
                { value: 'fast', label: t.settings.speedFast },
              ]}
              value={settings.speed}
              onChange={(speed) => update({ speed })}
            />
          </div>
        </Section>

        <Section title={t.settings.about}>
          <p className="about">{t.settings.aboutBody}</p>
          <p className="about dim">
            {t.settings.version} {__APP_VERSION__}
          </p>
        </Section>
        <button
          type="button"
          className="btn wide ghost"
          onClick={() => update({ ...DEFAULT_SETTINGS, tutorialOffered: settings.tutorialOffered })}
        >
          {t.settings.reset}
        </button>
      </div>
    </div>
  );
}
