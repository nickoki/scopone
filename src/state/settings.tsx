import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CardStyle } from '../cards';
import { DEFAULT_RULES, type Rules } from '../engine';
import { KEYS, loadJson, saveJson } from './storage';

export type LanguageSetting = 'auto' | 'it' | 'en';
export type Lang = 'it' | 'en';
export type Speed = 'normal' | 'fast';

export interface Settings {
  language: LanguageSetting;
  cardStyle: CardStyle;
  /** Small rank/suit index in the card corner. */
  showIndex: boolean;
  sound: boolean;
  speed: Speed;
  rules: Rules;
  playerName: string;
  /** The first-game tutorial offer has been answered. */
  tutorialOffered: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'auto',
  cardStyle: 'napoletane',
  showIndex: true,
  sound: true,
  speed: 'normal',
  rules: DEFAULT_RULES,
  playerName: '',
  tutorialOffered: false,
};

const CARD_STYLE_VALUES: readonly string[] = ['napoletane', 'piacentine', 'siciliane'];

/** Merge whatever was stored with the defaults, dropping anything invalid. */
export function sanitizeSettings(raw: unknown): Settings {
  const s = { ...DEFAULT_SETTINGS, rules: { ...DEFAULT_RULES } };
  if (!raw || typeof raw !== 'object') return s;
  const r = raw as Partial<Settings>;
  if (r.language === 'it' || r.language === 'en' || r.language === 'auto') s.language = r.language;
  if (typeof r.cardStyle === 'string' && CARD_STYLE_VALUES.includes(r.cardStyle)) s.cardStyle = r.cardStyle;
  if (typeof r.showIndex === 'boolean') s.showIndex = r.showIndex;
  if (typeof r.sound === 'boolean') s.sound = r.sound;
  if (r.speed === 'normal' || r.speed === 'fast') s.speed = r.speed;
  if (typeof r.playerName === 'string') s.playerName = r.playerName.slice(0, 14);
  if (typeof r.tutorialOffered === 'boolean') s.tutorialOffered = r.tutorialOffered;
  s.rules = sanitizeRules(r.rules);
  return s;
}

export function sanitizeRules(raw: unknown): Rules {
  const out = { ...DEFAULT_RULES };
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Partial<Rules>;
  if (r.variant === 'scientifico' || r.variant === 'classico') out.variant = r.variant;
  if (r.target === 11 || r.target === 21 || r.target === 31) out.target = r.target;
  if (typeof r.lastCardScopaExcluded === 'boolean') out.lastCardScopaExcluded = r.lastCardScopaExcluded;
  if (typeof r.reBello === 'boolean') out.reBello = r.reBello;
  if (typeof r.napola === 'boolean') out.napola = r.napola;
  return out;
}

export function detectLanguage(): Lang {
  try {
    const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const l of langs) {
      const code = l.toLowerCase();
      if (code.startsWith('it')) return 'it';
      if (code.startsWith('en')) return 'en';
    }
  } catch {
    /* ignore */
  }
  return 'en';
}

interface SettingsContextValue {
  settings: Settings;
  lang: Lang;
  update: (patch: Partial<Settings>) => void;
  updateRules: (patch: Partial<Rules>) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => sanitizeSettings(loadJson(KEYS.settings)));
  const lang: Lang = settings.language === 'auto' ? detectLanguage() : settings.language;

  useEffect(() => {
    saveJson(KEYS.settings, settings);
  }, [settings]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const update = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);
  const updateRules = useCallback(
    (patch: Partial<Rules>) => setSettings((s) => ({ ...s, rules: { ...s.rules, ...patch } })),
    [],
  );
  const value = useMemo(() => ({ settings, lang, update, updateRules }), [settings, lang, update, updateRules]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings outside SettingsProvider');
  return ctx;
}
