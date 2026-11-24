import type { Rules } from '../engine';
import { useT } from '../i18n';
import { Segmented, Toggle } from './common';

/** The game rule switches: used in Settings, in game setup and in the online lobby. */
export function RulesEditor({
  rules,
  onChange,
  disabled,
}: {
  rules: Rules;
  onChange: (patch: Partial<Rules>) => void;
  disabled?: boolean;
}) {
  const t = useT();
  return (
    <>
      <div className="row col">
        <span className="row-text">
          <span className="row-label">{t.rules.variant}</span>
          <span className="row-hint">
            {rules.variant === 'scientifico' ? t.rules.scientificoHint : t.rules.classicoHint}
          </span>
        </span>
        <Segmented
          label={t.rules.variant}
          disabled={disabled}
          options={[
            { value: 'scientifico', label: t.rules.scientifico },
            { value: 'classico', label: t.rules.classico },
          ]}
          value={rules.variant}
          onChange={(variant) => onChange({ variant })}
        />
      </div>
      <div className="row col">
        <span className="row-label">
          {t.rules.target}… {t.rules.points}
        </span>
        <Segmented
          label={t.rules.target}
          disabled={disabled}
          options={[
            { value: 11, label: '11' },
            { value: 21, label: '21' },
            { value: 31, label: '31' },
          ]}
          value={rules.target}
          onChange={(target) => onChange({ target })}
        />
      </div>
      <Toggle
        label={t.rules.lastCardScopa}
        hint={t.rules.lastCardScopaHint}
        checked={rules.lastCardScopaExcluded}
        disabled={disabled}
        onChange={(v) => onChange({ lastCardScopaExcluded: v })}
      />
      <Toggle label={t.rules.reBello} hint={t.rules.reBelloHint} checked={rules.reBello} disabled={disabled} onChange={(v) => onChange({ reBello: v })} />
      <Toggle label={t.rules.napola} hint={t.rules.napolaHint} checked={rules.napola} disabled={disabled} onChange={(v) => onChange({ napola: v })} />
    </>
  );
}
