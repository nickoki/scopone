import { useSettings } from '../state/settings';
import { en } from './en';
import { it, type Dict } from './it';

export type { Dict } from './it';

export const DICTS: Record<'it' | 'en', Dict> = { it, en };

/** The dictionary for the current language. */
export function useT(): Dict {
  return DICTS[useSettings().lang];
}
