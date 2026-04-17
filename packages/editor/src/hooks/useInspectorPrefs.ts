import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_PREFS,
  loadPrefs,
  savePrefs,
  type InspectorPrefs,
  type SectionId,
} from '../state/inspector-prefs';

/**
 * React-friendly inspector-prefs binding. Returns the current prefs +
 * a `toggleSection` setter. The first render uses DEFAULT_PREFS (so
 * the server-rendered / dehydrated tree matches client-pre-effect),
 * then a useEffect runs once on mount to pull the persisted value from
 * localStorage and update state. This avoids the SSR-hydration tear
 * pattern even though we don't SSR — keeps the hook future-proof.
 */
export function useInspectorPrefs(): {
  readonly prefs: InspectorPrefs;
  readonly toggleSection: (id: SectionId) => void;
} {
  const [prefs, setPrefs] = useState<InspectorPrefs>(DEFAULT_PREFS);

  useEffect(() => {
    setPrefs(loadPrefs());
  }, []);

  const toggleSection = useCallback((id: SectionId) => {
    setPrefs((cur) => {
      const isOpen = cur.openSections.includes(id);
      const nextOpen = isOpen
        ? cur.openSections.filter((s) => s !== id)
        : [...cur.openSections, id];
      const next: InspectorPrefs = { openSections: nextOpen };
      savePrefs(next);
      return next;
    });
  }, []);

  return { prefs, toggleSection };
}
