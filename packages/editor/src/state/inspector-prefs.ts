/**
 * Persistent UI state for the right-rail inspector. Only the open/closed
 * accordion state lives here; section content (geometry, color, etc.)
 * remains in EditState. Stored in localStorage so the user's "I always
 * keep Color collapsed" preference survives reloads.
 */
export type SectionId = 'geometry' | 'color' | 'detail' | 'overlay';

export interface InspectorPrefs {
  readonly openSections: readonly SectionId[];
}

export const STORAGE_KEY = 'pixflow.editor.inspectorPrefs.v1';

export const DEFAULT_PREFS: InspectorPrefs = {
  openSections: ['geometry', 'color'],
};

const VALID_SECTIONS: ReadonlySet<SectionId> = new Set<SectionId>([
  'geometry',
  'color',
  'detail',
  'overlay',
]);

/**
 * Load prefs from localStorage. Returns DEFAULT_PREFS on any failure
 * (no entry, malformed JSON, wrong shape, unknown section ids). The
 * editor must never crash from a corrupted localStorage — that would
 * lock the user out of their own machine.
 */
export function loadPrefs(): InspectorPrefs {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DEFAULT_PREFS;
    const open = (parsed as { openSections?: unknown }).openSections;
    if (!Array.isArray(open)) return DEFAULT_PREFS;
    const filtered = open.filter(
      (id): id is SectionId => typeof id === 'string' && VALID_SECTIONS.has(id as SectionId),
    );
    return { openSections: filtered };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: InspectorPrefs): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // QuotaExceeded or SecurityError (private mode); silently drop.
    // Inspector still works, just won't persist this session.
  }
}
