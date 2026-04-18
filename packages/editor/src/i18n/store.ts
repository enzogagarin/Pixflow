import { create } from 'zustand';
import { LOCALES, MESSAGES, type Locale, type MessageKey } from './messages';

const STORAGE_KEY = 'pixflow.editor.locale.v1';

function loadInitial(): Locale {
  if (typeof localStorage === 'undefined') return 'tr';
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && (LOCALES as readonly string[]).includes(raw)) return raw as Locale;
  } catch {
    /* private mode / quota — fall through to default */
  }
  return 'tr';
}

interface I18nStore {
  readonly locale: Locale;
  setLocale: (next: Locale) => void;
}

export const useI18nStore = create<I18nStore>((set) => ({
  locale: loadInitial(),
  setLocale: (next) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    set({ locale: next });
  },
}));

/**
 * Translate `key` and substitute `{placeholder}` tokens. Falls back to
 * English (and then to the raw key) so a missing TR translation still
 * renders something sensible — we never want the UI to show literal
 * `undefined` or a blank string.
 */
export function translate(
  locale: Locale,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const raw = MESSAGES[locale][key] ?? MESSAGES.en[key] ?? String(key);
  if (!vars) return raw;
  return Object.entries(vars).reduce(
    (s, [k, v]) => s.replaceAll(`{${k}}`, String(v)),
    raw,
  );
}
