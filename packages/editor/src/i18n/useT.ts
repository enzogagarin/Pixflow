import { useCallback } from 'react';
import { translate, useI18nStore } from './store';
import type { MessageKey } from './messages';

/**
 * Hook used by every UI component that renders text. Returns a stable
 * `t` function bound to the current locale — components re-render when
 * `useI18nStore` notifies of a locale change, at which point `t` picks
 * up the new translations transparently.
 */
export function useT(): (key: MessageKey, vars?: Record<string, string | number>) => string {
  const locale = useI18nStore((s) => s.locale);
  return useCallback(
    (key, vars) => translate(locale, key, vars),
    [locale],
  );
}
