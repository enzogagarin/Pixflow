# PR #6 — Inspector (Geometry + Color sections)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dev-only `DevStatePanel` with a real right-rail Inspector that lets the user edit `state.geometry` and `state.color` via accessible controls (rotate segmented, flip toggle, brightness/contrast/saturation/white-balance sliders) with live preview through PR #5's `PreviewEngine` and proper undo/redo via PR #4's `commit({ baseline })` API.

**Architecture:** Two new components — `Inspector` (right-rail accordion shell) + per-section panels (`GeometrySection`, `ColorSection`) — bind 1:1 to `EditState` subtrees. A shared `InspectorSlider` wraps Radix Slider with a numeric input + double-click reset, and a shared `useSliderDrag` hook implements the slider-drag discipline: every drag emit is `setPresent` (no history push); pointer release is `commit({ baseline })` so the gesture occupies one history entry. Accordion open/closed state persists in `localStorage` with a pure load/save module + a thin React hook. Immer earns its keep here for the first time — multi-line draft mutations like `draft.color.whiteBalance.temperature = v` read cleanly. The viewport from PR #5 gets `flex-1` and the Inspector takes a fixed-width column on the right.

**Tech stack:**
- Radix UI primitives: `@radix-ui/react-slider`, `@radix-ui/react-accordion`, `@radix-ui/react-toggle-group` (a11y + keyboard + visual states out of the box)
- `immer` (already installed in PR #4) for draft-mutation ergonomics on nested writes
- Existing zustand store from PR #4 (no schema changes; we only call `setPresent` + `commit({ baseline })`)
- Tailwind v4 (existing design tokens)
- Vitest (node env) for pure modules

**Critical contracts to honor** (verified by reading store.ts in PR #4):
- `useEditStore.getState().setPresent(next)` — no history entry, fires PreviewEngine re-render via the existing subscription in `usePreviewRender`.
- `useEditStore.getState().commit(next, { baseline })` — pushes `baseline` (NOT current `present`) onto past, sets `next` as new present, clears future. Used at pointer release; `baseline` is the pre-drag state captured on pointer down.
- `EditState` subtree shapes (from `state/types.ts`):
  - `geometry: { crop, rotate: 0|90|180|270, flip: { h, v } }`
  - `color: { brightness, contrast, saturation, whiteBalance: { temperature, tint } }`
  - All numeric color params are in [-1, 1].

**What this PR does NOT do** (deferred to later PRs):
- Crop tool itself (Geometry shows a "Crop" button that's a stub label — interactive crop lands in PR #7 per spec).
- Detail / Overlay / Export inspector sections (PRs #7, #8, #11).
- Slider modifier-aware drag (Alt = fine 0.01 step, Shift = coarse 0.1 step). Polish; default step 0.05 + arrow-key step 0.05 + double-click reset cover the "modern editor" base. If the user doesn't ask for it, leave it for a future polish pass.
- Bottom-bar `⟳ N steps undoable` indicator (already covered by `HistoryIndicator` from PR #4 in the top bar).

---

## File structure

**New files:**
- `packages/editor/src/state/inspector-prefs.ts` — Pure types + serialize/deserialize helpers for the accordion open-state. localStorage I/O is here so the React layer stays a thin shell.
- `packages/editor/src/hooks/useInspectorPrefs.ts` — React hook that loads on mount, exposes a `[prefs, setPrefs]` tuple, and writes through to localStorage on every change.
- `packages/editor/src/hooks/useSliderDrag.ts` — Encapsulates the baseline-capture + setPresent + commit dance. Returns `{ onValueChange, onValueCommit }` ready to drop onto Radix Slider.
- `packages/editor/src/components/inspector/Inspector.tsx` — Right-rail container; renders the Radix Accordion shell with two sections.
- `packages/editor/src/components/inspector/GeometrySection.tsx` — Rotate segmented (0/90/180/270) + Flip horizontal/vertical toggles + Crop stub button.
- `packages/editor/src/components/inspector/ColorSection.tsx` — Brightness/Contrast/Saturation sliders + White Balance sub-block (temp + tint sliders).
- `packages/editor/src/components/inspector/InspectorSlider.tsx` — Shared component: Radix Slider + numeric input next to it + double-click reset; uses `useSliderDrag` internally.
- `packages/editor/src/components/inspector/Segmented.tsx` — Shared component: Radix ToggleGroup (single mode) styled as a segmented bar.
- `packages/editor/test/inspector-prefs.test.ts` — Round-trip + default-fallback tests for the prefs serializer.
- `packages/editor/test/use-slider-drag.test.ts` — Tests that baseline is captured on first onValueChange and forwarded to commit; subsequent setPresent calls don't re-capture.

**Modified files:**
- `packages/editor/src/App.tsx` — Layout becomes a 2-column flex (viewport `flex-1` + Inspector `w-[320px] shrink-0`). `DevStatePanel` moves below the viewport (still useful for preset spray during smoke tests; PR #11 retires it).
- `packages/editor/package.json` — Add the three Radix primitives.

**Files left untouched:** the entire PR #5 viewport stack (`CanvasViewport`, `useViewport`, `PreviewEngine`, etc.) — Inspector writes through the same store the viewport already subscribes to, so no plumbing changes needed.

---

## Task 1 — Install Radix primitives

**Why first:** every component in this PR imports from `@radix-ui/react-*`. Without the deps, type-checking fails immediately.

**Files:**
- Modify: `packages/editor/package.json`

- [ ] **Step 1.1 — Install the three Radix primitives**

```bash
pnpm --filter @pixflow/editor add @radix-ui/react-slider@^1.2.0 @radix-ui/react-accordion@^1.2.0 @radix-ui/react-toggle-group@^1.1.0
```

Expected output: pnpm reports three new dependencies added; `pnpm-lock.yaml` updates.

- [ ] **Step 1.2 — Verify type-check still clean (no new code yet, just deps)**

```bash
pnpm --filter @pixflow/editor exec tsc --noEmit
```
Expected: 0 errors. (Adding deps shouldn't break existing code; this confirms the install didn't pull conflicting types.)

- [ ] **Step 1.3 — Verify build still works**

```bash
pnpm --filter @pixflow/editor build
```
Expected: build succeeds. Note the new bundle size — Radix primitives unused at runtime should tree-shake to ~0; size shouldn't grow until we actually import.

- [ ] **Step 1.4 — Commit**

```bash
git add packages/editor/package.json pnpm-lock.yaml
git commit -m "chore(editor): add Radix slider/accordion/toggle-group for inspector (PR #6 deps)"
```

---

## Task 2 — `inspector-prefs` (pure localStorage helpers)

**Why early:** the Accordion in Task 8 needs initial state (which sections are open) on mount. Pure I/O isolated here keeps that component simple.

**Files:**
- Create: `packages/editor/src/state/inspector-prefs.ts`
- Create: `packages/editor/test/inspector-prefs.test.ts`

- [ ] **Step 2.1 — Write the failing test**

Create `packages/editor/test/inspector-prefs.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_PREFS,
  STORAGE_KEY,
  loadPrefs,
  savePrefs,
  type InspectorPrefs,
} from '../src/state/inspector-prefs';

// vitest's node env doesn't ship localStorage; provide a tiny in-memory shim.
const memStore = new Map<string, string>();
beforeEach(() => {
  memStore.clear();
  globalThis.localStorage = {
    getItem: (k: string) => memStore.get(k) ?? null,
    setItem: (k: string, v: string) => void memStore.set(k, v),
    removeItem: (k: string) => void memStore.delete(k),
    clear: () => memStore.clear(),
    length: 0,
    key: () => null,
  } as Storage;
});

describe('loadPrefs', () => {
  it('returns DEFAULT_PREFS when localStorage has nothing', () => {
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });

  it('returns DEFAULT_PREFS (and does not throw) when stored JSON is malformed', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json');
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });

  it('returns DEFAULT_PREFS when stored shape is missing required fields', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ unrelated: true }));
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });

  it('round-trips a valid prefs object', () => {
    const custom: InspectorPrefs = { openSections: ['geometry'] };
    savePrefs(custom);
    expect(loadPrefs()).toEqual(custom);
  });

  it('default has both Geometry and Color open', () => {
    expect(DEFAULT_PREFS.openSections).toEqual(['geometry', 'color']);
  });
});

describe('savePrefs', () => {
  it('writes JSON under STORAGE_KEY', () => {
    savePrefs({ openSections: [] });
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual({ openSections: [] });
  });
});
```

- [ ] **Step 2.2 — Run test (expected: fail)**

```bash
pnpm --filter @pixflow/editor test --run inspector-prefs
```
Expected: `Cannot find module '../src/state/inspector-prefs'`.

- [ ] **Step 2.3 — Implement `inspector-prefs.ts`**

Create `packages/editor/src/state/inspector-prefs.ts`:

```typescript
/**
 * Persistent UI state for the right-rail inspector. Only the open/closed
 * accordion state lives here; section content (geometry, color, etc.)
 * remains in EditState. Stored in localStorage so the user's "I always
 * keep Color collapsed" preference survives reloads.
 */
export type SectionId = 'geometry' | 'color';

export interface InspectorPrefs {
  readonly openSections: readonly SectionId[];
}

export const STORAGE_KEY = 'pixflow.editor.inspectorPrefs.v1';

export const DEFAULT_PREFS: InspectorPrefs = {
  openSections: ['geometry', 'color'],
};

const VALID_SECTIONS: ReadonlySet<SectionId> = new Set(['geometry', 'color']);

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
```

- [ ] **Step 2.4 — Run test (expected: pass)**

```bash
pnpm --filter @pixflow/editor test --run inspector-prefs
```
Expected: `6 passed`.

- [ ] **Step 2.5 — Commit**

```bash
git add packages/editor/src/state/inspector-prefs.ts packages/editor/test/inspector-prefs.test.ts
git commit -m "feat(editor): inspector accordion prefs with localStorage round-trip + corruption guard (PR #6 part 1/9)"
```

---

## Task 3 — `useInspectorPrefs` React hook

**Why:** glues `inspector-prefs` to React's render cycle so Inspector can re-render when the user toggles a section.

**Files:**
- Create: `packages/editor/src/hooks/useInspectorPrefs.ts`

No unit test — pure glue around `useState` + `useEffect`; the underlying I/O is already tested in Task 2. Browser smoke covers the rest.

- [ ] **Step 3.1 — Implement `useInspectorPrefs.ts`**

Create `packages/editor/src/hooks/useInspectorPrefs.ts`:

```typescript
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
```

- [ ] **Step 3.2 — Type-check**

```bash
pnpm --filter @pixflow/editor exec tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 3.3 — Commit**

```bash
git add packages/editor/src/hooks/useInspectorPrefs.ts
git commit -m "feat(editor): useInspectorPrefs hook bridges localStorage to React state (PR #6 part 2/9)"
```

---

## Task 4 — `useSliderDrag` hook (slider-drag discipline)

**Why:** Every InspectorSlider in this PR uses the same baseline-capture + setPresent + commit dance. Encapsulating it once means each section's slider just wires `value` + `onValueChange` + `onValueCommit` onto Radix.

**Files:**
- Create: `packages/editor/src/hooks/useSliderDrag.ts`
- Create: `packages/editor/test/use-slider-drag.test.ts`

- [ ] **Step 4.1 — Write the failing test**

Create `packages/editor/test/use-slider-drag.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSliderDrag } from '../src/hooks/useSliderDrag';
import { useEditStore } from '../src/state/store';
import { makeState } from './test-helpers';
import { produce } from 'immer';

// In-memory image bitmap is fine — store.loadImage doesn't decode it.
const dummyBitmap = {} as unknown as ImageBitmap;
const dummyFile = new File([], 'test.jpg', { type: 'image/jpeg' });

beforeEach(() => {
  useEditStore.getState().clear();
  useEditStore.getState().loadImage(dummyFile, dummyBitmap, {}, 100, 100);
});

describe('useSliderDrag', () => {
  it('first onValueChange captures the pre-drag baseline and fires setPresent (no history push)', () => {
    const { result } = renderHook(() =>
      useSliderDrag({
        getNextState: (v: number) =>
          produce(useEditStore.getState().document!.present, (d) => {
            d.color.brightness = v;
          }),
      }),
    );
    const initialPast = useEditStore.getState().document!.past;
    act(() => {
      result.current.onValueChange(0.2);
    });
    expect(useEditStore.getState().document!.present.color.brightness).toBe(0.2);
    // No commit yet — past must be unchanged.
    expect(useEditStore.getState().document!.past).toBe(initialPast);
  });

  it('subsequent onValueChange calls keep updating present without pushing history', () => {
    const { result } = renderHook(() =>
      useSliderDrag({
        getNextState: (v: number) =>
          produce(useEditStore.getState().document!.present, (d) => {
            d.color.brightness = v;
          }),
      }),
    );
    act(() => result.current.onValueChange(0.1));
    act(() => result.current.onValueChange(0.2));
    act(() => result.current.onValueChange(0.3));
    expect(useEditStore.getState().document!.present.color.brightness).toBe(0.3);
    expect(useEditStore.getState().document!.past).toHaveLength(0);
  });

  it('onValueCommit fires commit() with the captured baseline (one history entry per gesture)', () => {
    const { result } = renderHook(() =>
      useSliderDrag({
        getNextState: (v: number) =>
          produce(useEditStore.getState().document!.present, (d) => {
            d.color.brightness = v;
          }),
      }),
    );
    const baseline = useEditStore.getState().document!.present;
    act(() => result.current.onValueChange(0.1));
    act(() => result.current.onValueChange(0.2));
    act(() => result.current.onValueCommit(0.2));
    const doc = useEditStore.getState().document!;
    expect(doc.past).toHaveLength(1);
    expect(doc.past[0]).toBe(baseline); // identity, not a copy
    expect(doc.present.color.brightness).toBe(0.2);
  });

  it('after commit, the next onValueChange captures a NEW baseline', () => {
    const { result } = renderHook(() =>
      useSliderDrag({
        getNextState: (v: number) =>
          produce(useEditStore.getState().document!.present, (d) => {
            d.color.brightness = v;
          }),
      }),
    );
    // First gesture
    act(() => result.current.onValueChange(0.2));
    act(() => result.current.onValueCommit(0.2));
    const afterFirstCommit = useEditStore.getState().document!.present;
    // Second gesture
    act(() => result.current.onValueChange(0.5));
    act(() => result.current.onValueCommit(0.5));
    const doc = useEditStore.getState().document!;
    expect(doc.past).toHaveLength(2);
    // The second gesture's baseline must be the post-first-commit state.
    expect(doc.past[1]).toBe(afterFirstCommit);
  });

  it('reset() commits a single transition from the current present to the resetValue', () => {
    const { result } = renderHook(() =>
      useSliderDrag({
        getNextState: (v: number) =>
          produce(useEditStore.getState().document!.present, (d) => {
            d.color.brightness = v;
          }),
      }),
    );
    act(() => result.current.onValueChange(0.4));
    act(() => result.current.onValueCommit(0.4));
    const beforeReset = useEditStore.getState().document!.present;
    act(() => result.current.reset(0));
    const doc = useEditStore.getState().document!;
    expect(doc.present.color.brightness).toBe(0);
    expect(doc.past[doc.past.length - 1]).toBe(beforeReset);
  });
});
```

- [ ] **Step 4.2 — Install testing-library/react for renderHook**

The hook test needs `renderHook` from `@testing-library/react`, which we don't have yet.

```bash
pnpm --filter @pixflow/editor add -D @testing-library/react@^16.0.0 jsdom@^25.0.0
```

Then update `packages/editor/vite.config.ts` to enable jsdom for hook tests. Edit `packages/editor/vite.config.ts` and add a `test` block at the bottom of the `defineConfig` object:

```typescript
  test: {
    environment: 'node',
    environmentMatchGlobs: [
      ['test/use-slider-drag.test.ts', 'jsdom'],
    ],
  },
```

(Per-file environment override — keeps the rest of the suite fast in node env, only the hook test uses jsdom.)

- [ ] **Step 4.3 — Run the failing test**

```bash
pnpm --filter @pixflow/editor test --run use-slider-drag
```
Expected: `Cannot find module '../src/hooks/useSliderDrag'`.

- [ ] **Step 4.4 — Implement `useSliderDrag.ts`**

Create `packages/editor/src/hooks/useSliderDrag.ts`:

```typescript
import { useCallback, useRef } from 'react';
import { useEditStore } from '../state/store';
import type { EditState } from '../state/types';

interface UseSliderDragArgs {
  /**
   * Pure function: given a slider value, return the next EditState.
   * Typically built with immer's `produce` over `getState().present`.
   * Called for every drag emit, so it must be cheap.
   */
  readonly getNextState: (value: number) => EditState;
}

interface UseSliderDragResult {
  /** Wire to Radix Slider's `onValueChange` (continuous, drag emits). */
  readonly onValueChange: (value: number) => void;
  /** Wire to Radix Slider's `onValueCommit` (pointer release). */
  readonly onValueCommit: (value: number) => void;
  /** Imperative reset — used by double-click → set to default value. */
  readonly reset: (defaultValue: number) => void;
}

/**
 * Implements the slider-drag discipline from spec Section 3:
 * - Every drag emit (`onValueChange`) calls `setPresent` so the
 *   PreviewEngine re-renders, but does NOT push history (live preview).
 * - On pointer release (`onValueCommit`), a single `commit({ baseline })`
 *   pushes ONE history entry for the whole gesture, with `baseline`
 *   being the pre-drag state captured on the first emit.
 * - `reset` is a one-shot commit that turns into a normal history entry
 *   (no baseline gymnastics — double-click reset is its own gesture).
 */
export function useSliderDrag(args: UseSliderDragArgs): UseSliderDragResult {
  const baselineRef = useRef<EditState | null>(null);

  const onValueChange = useCallback(
    (value: number) => {
      const store = useEditStore.getState();
      if (!store.document) return;
      // Capture the baseline on the FIRST emit of a gesture. Subsequent
      // emits preserve the baseline so onValueCommit can pass it through.
      if (baselineRef.current === null) {
        baselineRef.current = store.document.present;
      }
      const next = args.getNextState(value);
      store.setPresent(next);
    },
    [args],
  );

  const onValueCommit = useCallback(
    (value: number) => {
      const store = useEditStore.getState();
      if (!store.document) return;
      const baseline = baselineRef.current;
      // Reset the baseline immediately so a subsequent gesture captures
      // fresh state, regardless of whether the commit goes through.
      baselineRef.current = null;
      const next = args.getNextState(value);
      if (baseline) {
        store.commit(next, { baseline });
      } else {
        // No prior onValueChange (e.g. user clicked the slider track
        // without dragging) — just commit normally; current present
        // becomes the past entry.
        store.commit(next);
      }
    },
    [args],
  );

  const reset = useCallback(
    (defaultValue: number) => {
      const store = useEditStore.getState();
      if (!store.document) return;
      // Drop any in-flight baseline; reset is its own discrete action.
      baselineRef.current = null;
      const next = args.getNextState(defaultValue);
      store.commit(next);
    },
    [args],
  );

  return { onValueChange, onValueCommit, reset };
}
```

- [ ] **Step 4.5 — Run test (expected: pass)**

```bash
pnpm --filter @pixflow/editor test --run use-slider-drag
```
Expected: `5 passed`.

If the import of `produce` from immer fails (TS path resolution), confirm `immer` is in deps with `pnpm --filter @pixflow/editor list immer` — should report `immer 11.x`.

- [ ] **Step 4.6 — Commit**

```bash
git add packages/editor/src/hooks/useSliderDrag.ts packages/editor/test/use-slider-drag.test.ts packages/editor/package.json packages/editor/vite.config.ts pnpm-lock.yaml
git commit -m "feat(editor): useSliderDrag hook implements baseline + setPresent/commit gesture discipline (PR #6 part 3/9)"
```

---

## Task 5 — `InspectorSlider` shared component

**Why:** every Color section slider has the same shape (label + numeric value + Radix slider + double-click reset). Centralize.

**Files:**
- Create: `packages/editor/src/components/inspector/InspectorSlider.tsx`

- [ ] **Step 5.1 — Implement `InspectorSlider.tsx`**

Create `packages/editor/src/components/inspector/InspectorSlider.tsx`:

```typescript
import * as Slider from '@radix-ui/react-slider';
import { useCallback, type ChangeEvent } from 'react';
import { useSliderDrag } from '../../hooks/useSliderDrag';
import type { EditState } from '../../state/types';

interface InspectorSliderProps {
  readonly label: string;
  /** Current value read from EditState (controlled). */
  readonly value: number;
  /** Slider domain. */
  readonly min: number;
  readonly max: number;
  /** Step for keyboard arrow-key + drag snapping. */
  readonly step: number;
  /** Value snapped to on double-click reset. */
  readonly resetValue: number;
  /** Decimal places to show in the numeric input. */
  readonly precision: number;
  /**
   * Pure function: given a candidate slider value, return the next
   * EditState. Forwarded to useSliderDrag.
   */
  readonly getNextState: (value: number) => EditState;
}

/**
 * One row of the Color inspector. Layout:
 *
 *   [Label …………………………………………… numeric]
 *   [────────────●────────────────────]
 *
 * Behavior:
 * - Drag the thumb: live preview via setPresent, ONE history entry on release.
 * - Click the track: jumps + commits as a one-shot (no drag = no baseline).
 * - Double-click anywhere on the row: reset to `resetValue`.
 * - Type into the numeric input: setPresent on every keystroke, commit on blur.
 *   (The numeric input is the textual peer of the slider thumb — same
 *   discipline. Implementing this with the same useSliderDrag instance
 *   keeps both inputs in lockstep.)
 */
export function InspectorSlider(props: InspectorSliderProps) {
  const { onValueChange, onValueCommit, reset } = useSliderDrag({
    getNextState: props.getNextState,
  });

  const onSliderChange = useCallback(
    (next: number[]) => {
      const v = next[0];
      if (v !== undefined) onValueChange(v);
    },
    [onValueChange],
  );

  const onSliderCommit = useCallback(
    (next: number[]) => {
      const v = next[0];
      if (v !== undefined) onValueCommit(v);
    },
    [onValueCommit],
  );

  const onNumericChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const v = Number(e.target.value);
      if (Number.isFinite(v) && v >= props.min && v <= props.max) {
        onValueChange(v);
      }
    },
    [onValueChange, props.min, props.max],
  );

  const onNumericBlur = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const v = Number(e.target.value);
      if (Number.isFinite(v) && v >= props.min && v <= props.max) {
        onValueCommit(v);
      }
    },
    [onValueCommit, props.min, props.max],
  );

  const onDoubleClick = useCallback(() => {
    reset(props.resetValue);
  }, [reset, props.resetValue]);

  return (
    <div
      className="flex flex-col gap-1"
      onDoubleClick={onDoubleClick}
      title={`Double-click to reset to ${props.resetValue.toString()}`}
    >
      <div className="flex items-center justify-between font-[var(--font-mono)] text-xs">
        <label className="text-[var(--color-muted)]">{props.label}</label>
        <input
          type="number"
          value={props.value.toFixed(props.precision)}
          min={props.min}
          max={props.max}
          step={props.step}
          onChange={onNumericChange}
          onBlur={onNumericBlur}
          className="w-16 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1 py-0.5 text-right tabular-nums focus:border-[var(--color-accent)] focus:outline-none"
        />
      </div>
      <Slider.Root
        className="relative flex h-5 items-center"
        value={[props.value]}
        min={props.min}
        max={props.max}
        step={props.step}
        onValueChange={onSliderChange}
        onValueCommit={onSliderCommit}
      >
        <Slider.Track className="relative h-1 flex-1 rounded-full bg-[var(--color-border)]">
          <Slider.Range className="absolute h-full rounded-full bg-[var(--color-accent-dim)]" />
        </Slider.Track>
        <Slider.Thumb
          aria-label={props.label}
          className="block h-4 w-4 rounded-full border border-[var(--color-accent)] bg-[var(--color-bg)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        />
      </Slider.Root>
    </div>
  );
}
```

- [ ] **Step 5.2 — Type-check**

```bash
pnpm --filter @pixflow/editor exec tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 5.3 — Commit**

```bash
git add packages/editor/src/components/inspector/InspectorSlider.tsx
git commit -m "feat(editor): InspectorSlider with Radix slider + numeric input + double-click reset (PR #6 part 4/9)"
```

---

## Task 6 — `Segmented` shared component

**Why:** Geometry's rotate control needs a 4-state segmented bar; Radix ToggleGroup gives us a11y + keyboard arrows + radio-style behavior for free.

**Files:**
- Create: `packages/editor/src/components/inspector/Segmented.tsx`

- [ ] **Step 6.1 — Implement `Segmented.tsx`**

Create `packages/editor/src/components/inspector/Segmented.tsx`:

```typescript
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { useCallback } from 'react';

interface SegmentedOption<V extends string> {
  readonly value: V;
  readonly label: string;
}

interface SegmentedProps<V extends string> {
  readonly value: V;
  readonly options: readonly SegmentedOption<V>[];
  readonly onChange: (next: V) => void;
  readonly ariaLabel: string;
}

/**
 * Single-select segmented control built on Radix ToggleGroup. The
 * "single" type makes it behave like a radio group with arrow-key
 * navigation. Visually styled as joined buttons.
 *
 * `V` is constrained to `string` so the value can flow through Radix's
 * string-only event handlers without coercion.
 */
export function Segmented<V extends string>(props: SegmentedProps<V>) {
  const onValueChange = useCallback(
    (next: string) => {
      // Radix fires '' when the user un-selects; segmented control should
      // always have a selection, so ignore empty.
      if (next === '') return;
      props.onChange(next as V);
    },
    [props],
  );

  return (
    <ToggleGroup.Root
      type="single"
      value={props.value}
      onValueChange={onValueChange}
      aria-label={props.ariaLabel}
      className="inline-flex overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] font-[var(--font-mono)] text-xs"
    >
      {props.options.map((opt) => (
        <ToggleGroup.Item
          key={opt.value}
          value={opt.value}
          aria-label={opt.label}
          className="px-2.5 py-1 text-[var(--color-muted)] hover:text-[var(--color-fg)] data-[state=on]:bg-[var(--color-accent-dim)] data-[state=on]:text-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
        >
          {opt.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
```

- [ ] **Step 6.2 — Type-check**

```bash
pnpm --filter @pixflow/editor exec tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 6.3 — Commit**

```bash
git add packages/editor/src/components/inspector/Segmented.tsx
git commit -m "feat(editor): Segmented control on Radix ToggleGroup (PR #6 part 5/9)"
```

---

## Task 7 — `GeometrySection` panel

**Files:**
- Create: `packages/editor/src/components/inspector/GeometrySection.tsx`

- [ ] **Step 7.1 — Implement `GeometrySection.tsx`**

Create `packages/editor/src/components/inspector/GeometrySection.tsx`:

```typescript
import { produce } from 'immer';
import { useCallback } from 'react';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { useEditStore } from '../../state/store';
import { Segmented } from './Segmented';

const ROTATE_OPTIONS = [
  { value: '0', label: '0°' },
  { value: '90', label: '90°' },
  { value: '180', label: '180°' },
  { value: '270', label: '270°' },
] as const;

/**
 * Geometry inspector. Maps 1:1 to state.geometry:
 *   - Rotate: segmented control (0/90/180/270 degrees)
 *   - Flip: two toggle buttons (horizontal + vertical)
 *   - Crop: stub button (interactive crop tool lands in PR #7)
 *
 * All edits use single-shot commits (no drag discipline — these are
 * discrete clicks, not continuous gestures).
 */
export function GeometrySection() {
  const document = useEditStore((s) => s.document);

  const onRotateChange = useCallback((next: string) => {
    const store = useEditStore.getState();
    if (!store.document) return;
    const deg = Number(next) as 0 | 90 | 180 | 270;
    store.commit(
      produce(store.document.present, (d) => {
        d.geometry.rotate = deg;
      }),
    );
  }, []);

  const onFlipChange = useCallback((axes: string[]) => {
    const store = useEditStore.getState();
    if (!store.document) return;
    store.commit(
      produce(store.document.present, (d) => {
        d.geometry.flip = {
          h: axes.includes('h'),
          v: axes.includes('v'),
        };
      }),
    );
  }, []);

  if (!document) return null;
  const { geometry } = document.present;
  const flipValue: string[] = [];
  if (geometry.flip.h) flipValue.push('h');
  if (geometry.flip.v) flipValue.push('v');

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <span className="font-[var(--font-mono)] text-xs text-[var(--color-muted)]">
          Rotate
        </span>
        <Segmented
          value={String(geometry.rotate)}
          options={ROTATE_OPTIONS}
          onChange={onRotateChange}
          ariaLabel="Rotation in degrees"
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="font-[var(--font-mono)] text-xs text-[var(--color-muted)]">
          Flip
        </span>
        <ToggleGroup.Root
          type="multiple"
          value={flipValue}
          onValueChange={onFlipChange}
          aria-label="Flip axes"
          className="inline-flex overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] font-[var(--font-mono)] text-xs"
        >
          <ToggleGroup.Item
            value="h"
            aria-label="Flip horizontal"
            className="px-2.5 py-1 text-[var(--color-muted)] hover:text-[var(--color-fg)] data-[state=on]:bg-[var(--color-accent-dim)] data-[state=on]:text-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          >
            ⇆
          </ToggleGroup.Item>
          <ToggleGroup.Item
            value="v"
            aria-label="Flip vertical"
            className="px-2.5 py-1 text-[var(--color-muted)] hover:text-[var(--color-fg)] data-[state=on]:bg-[var(--color-accent-dim)] data-[state=on]:text-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          >
            ⇅
          </ToggleGroup.Item>
        </ToggleGroup.Root>
      </div>

      <div className="flex items-center justify-between">
        <span className="font-[var(--font-mono)] text-xs text-[var(--color-muted)]">
          Crop
        </span>
        <button
          type="button"
          disabled
          title="Crop tool ships in PR #7"
          className="cursor-not-allowed rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1 font-[var(--font-mono)] text-xs text-[var(--color-muted)] opacity-50"
        >
          Enter crop tool
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 7.2 — Type-check**

```bash
pnpm --filter @pixflow/editor exec tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 7.3 — Commit**

```bash
git add packages/editor/src/components/inspector/GeometrySection.tsx
git commit -m "feat(editor): GeometrySection with rotate segmented + flip toggles + crop stub (PR #6 part 6/9)"
```

---

## Task 8 — `ColorSection` panel

**Files:**
- Create: `packages/editor/src/components/inspector/ColorSection.tsx`

- [ ] **Step 8.1 — Implement `ColorSection.tsx`**

Create `packages/editor/src/components/inspector/ColorSection.tsx`:

```typescript
import { produce } from 'immer';
import { useCallback } from 'react';
import { useEditStore } from '../../state/store';
import type { EditState } from '../../state/types';
import { InspectorSlider } from './InspectorSlider';

/**
 * Color inspector. Three top-level sliders (brightness, contrast,
 * saturation) plus a White Balance subsection with two slaves
 * (temperature, tint). All five sliders share the same domain
 * [-1, 1], step 0.05, reset 0, precision 2.
 *
 * Each slider's `getNextState` is a small immer producer that writes
 * exactly one field. The store does identity-comparison short-circuit
 * in PreviewEngine, so sliders that emit the same value twice in a
 * row don't trigger redundant renders.
 */
export function ColorSection() {
  const document = useEditStore((s) => s.document);

  const setBrightness = useCallback(
    (v: number): EditState =>
      produce(useEditStore.getState().document!.present, (d) => {
        d.color.brightness = v;
      }),
    [],
  );
  const setContrast = useCallback(
    (v: number): EditState =>
      produce(useEditStore.getState().document!.present, (d) => {
        d.color.contrast = v;
      }),
    [],
  );
  const setSaturation = useCallback(
    (v: number): EditState =>
      produce(useEditStore.getState().document!.present, (d) => {
        d.color.saturation = v;
      }),
    [],
  );
  const setTemperature = useCallback(
    (v: number): EditState =>
      produce(useEditStore.getState().document!.present, (d) => {
        d.color.whiteBalance.temperature = v;
      }),
    [],
  );
  const setTint = useCallback(
    (v: number): EditState =>
      produce(useEditStore.getState().document!.present, (d) => {
        d.color.whiteBalance.tint = v;
      }),
    [],
  );

  if (!document) return null;
  const { color } = document.present;

  return (
    <div className="flex flex-col gap-4 p-3">
      <InspectorSlider
        label="Brightness"
        value={color.brightness}
        min={-1}
        max={1}
        step={0.05}
        resetValue={0}
        precision={2}
        getNextState={setBrightness}
      />
      <InspectorSlider
        label="Contrast"
        value={color.contrast}
        min={-1}
        max={1}
        step={0.05}
        resetValue={0}
        precision={2}
        getNextState={setContrast}
      />
      <InspectorSlider
        label="Saturation"
        value={color.saturation}
        min={-1}
        max={1}
        step={0.05}
        resetValue={0}
        precision={2}
        getNextState={setSaturation}
      />

      <div className="flex flex-col gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-2">
        <span className="font-[var(--font-mono)] text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
          White balance
        </span>
        <InspectorSlider
          label="Temp"
          value={color.whiteBalance.temperature}
          min={-1}
          max={1}
          step={0.05}
          resetValue={0}
          precision={2}
          getNextState={setTemperature}
        />
        <InspectorSlider
          label="Tint"
          value={color.whiteBalance.tint}
          min={-1}
          max={1}
          step={0.05}
          resetValue={0}
          precision={2}
          getNextState={setTint}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 8.2 — Type-check**

```bash
pnpm --filter @pixflow/editor exec tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 8.3 — Commit**

```bash
git add packages/editor/src/components/inspector/ColorSection.tsx
git commit -m "feat(editor): ColorSection with 5 sliders (B/C/S + WB temp/tint) (PR #6 part 7/9)"
```

---

## Task 9 — `Inspector` shell (Radix Accordion)

**Files:**
- Create: `packages/editor/src/components/inspector/Inspector.tsx`

- [ ] **Step 9.1 — Implement `Inspector.tsx`**

Create `packages/editor/src/components/inspector/Inspector.tsx`:

```typescript
import * as Accordion from '@radix-ui/react-accordion';
import { useCallback } from 'react';
import { useEditStore } from '../../state/store';
import { useInspectorPrefs } from '../../hooks/useInspectorPrefs';
import type { SectionId } from '../../state/inspector-prefs';
import { GeometrySection } from './GeometrySection';
import { ColorSection } from './ColorSection';

/**
 * Right-rail inspector. Renders nothing until a document is loaded
 * (the empty-state view is the DropZone). Sections are independent
 * accordion panels; the open/closed state is persisted via
 * useInspectorPrefs and survives page reloads.
 */
export function Inspector() {
  const document = useEditStore((s) => s.document);
  const { prefs, toggleSection } = useInspectorPrefs();

  const onValueChange = useCallback(
    (next: string[]) => {
      // Diff against current prefs to find the toggled section, then
      // delegate. This keeps the localStorage write path single-source.
      const cur = new Set<string>(prefs.openSections);
      const nx = new Set<string>(next);
      const added = [...nx].find((s) => !cur.has(s));
      const removed = [...cur].find((s) => !nx.has(s));
      const toggled = added ?? removed;
      if (toggled) toggleSection(toggled as SectionId);
    },
    [prefs.openSections, toggleSection],
  );

  if (!document) return null;

  return (
    <aside className="flex w-[320px] shrink-0 flex-col overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)]">
      <header className="border-b border-[var(--color-border)] px-3 py-2 font-[var(--font-mono)] text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
        Inspector
      </header>
      <Accordion.Root
        type="multiple"
        value={[...prefs.openSections]}
        onValueChange={onValueChange}
        className="flex flex-col"
      >
        <Accordion.Item value="geometry" className="border-b border-[var(--color-border)]">
          <Accordion.Header>
            <Accordion.Trigger className="flex w-full items-center justify-between px-3 py-2 font-[var(--font-mono)] text-xs hover:bg-[var(--color-bg)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] data-[state=open]:text-[var(--color-accent)]">
              <span>Geometry</span>
              <span aria-hidden="true" className="data-[state=open]:rotate-90">▸</span>
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content>
            <GeometrySection />
          </Accordion.Content>
        </Accordion.Item>

        <Accordion.Item value="color">
          <Accordion.Header>
            <Accordion.Trigger className="flex w-full items-center justify-between px-3 py-2 font-[var(--font-mono)] text-xs hover:bg-[var(--color-bg)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] data-[state=open]:text-[var(--color-accent)]">
              <span>Color</span>
              <span aria-hidden="true" className="data-[state=open]:rotate-90">▸</span>
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content>
            <ColorSection />
          </Accordion.Content>
        </Accordion.Item>
      </Accordion.Root>
    </aside>
  );
}
```

- [ ] **Step 9.2 — Type-check**

```bash
pnpm --filter @pixflow/editor exec tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 9.3 — Commit**

```bash
git add packages/editor/src/components/inspector/Inspector.tsx
git commit -m "feat(editor): Inspector accordion shell with persistent open-state (PR #6 part 8/9)"
```

---

## Task 10 — App layout integration

**Why:** mount `<Inspector />` in `App.tsx` as the right rail; make the viewport `flex-1` so it fills remaining width. `DevStatePanel` moves below the viewport (still useful for preset-spray smoke tests; PR #11 retires it).

**Files:**
- Modify: `packages/editor/src/App.tsx`

- [ ] **Step 10.1 — Replace `App.tsx` body**

Replace the entire contents of `packages/editor/src/App.tsx` with:

```typescript
import { CanvasViewport } from './components/CanvasViewport';
import { DevStatePanel } from './components/DevStatePanel';
import { DropZone } from './components/DropZone';
import { HistoryIndicator } from './components/HistoryIndicator';
import { Inspector } from './components/inspector/Inspector';
import { WebGPUStatus } from './components/WebGPUStatus';
import { EditorContextProvider } from './context/EditorContextProvider';
import { useUndoRedoShortcuts } from './hooks/useUndoRedoShortcuts';
import { useEditStore } from './state/store';
import pixflowPkg from 'pixflow/package.json';

export function App() {
  return (
    <EditorContextProvider>
      <AppShell />
    </EditorContextProvider>
  );
}

function AppShell() {
  useUndoRedoShortcuts();
  const document = useEditStore((s) => s.document);

  return (
    <main className="flex min-h-screen flex-col gap-4 px-6 py-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-[var(--font-mono)] text-2xl leading-none text-[var(--color-accent)]">
            ▤
          </span>
          <h1 className="font-[var(--font-mono)] text-xl font-bold tracking-tight">
            Pixflow Editor
          </h1>
          <span className="rounded border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-2 py-[2px] font-[var(--font-mono)] text-xs text-[var(--color-muted)]">
            pre-alpha · PR #6
          </span>
        </div>
        <div className="flex items-center gap-3">
          <WebGPUStatus />
          <HistoryIndicator />
        </div>
      </header>

      {document ? (
        <div className="flex flex-1 gap-4">
          <div className="flex flex-1 flex-col gap-4">
            <CanvasViewport />
            <DevStatePanel />
          </div>
          <Inspector />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <DropZone />
        </div>
      )}

      <footer className="flex items-center justify-between font-[var(--font-mono)] text-[11px] text-[var(--color-muted)]">
        <span>imported pixflow v{pixflowPkg.version}</span>
        <span>Drop image · ⌘Z undo · ⇧⌘Z redo · Space pan · / compare · +/− zoom · 2× click slider = reset</span>
      </footer>
    </main>
  );
}
```

- [ ] **Step 10.2 — Type-check + run all tests**

```bash
pnpm --filter @pixflow/editor exec tsc --noEmit
pnpm --filter @pixflow/editor test --run
```
Expected: 0 type errors. Test count = PR #5's 85 + new (6 inspector-prefs + 5 use-slider-drag = 11) = 96 total.

- [ ] **Step 10.3 — Build the bundle and report sizes**

```bash
pnpm --filter @pixflow/editor build
```
Expected: build succeeds. Note new JS / gzip sizes (Radix + Inspector code probably +30-50 KB JS / +10-15 KB gzip).

- [ ] **Step 10.4 — Commit**

```bash
git add packages/editor/src/App.tsx
git commit -m "feat(editor): mount Inspector right rail; viewport now flex-1 (PR #6 part 9/9)"
```

---

## Task 11 — Browser smoke + memory snapshot

**Why:** Inspector lives or dies by interaction feel. Verify in browser, then update memory.

- [ ] **Step 11.1 — Start the dev server**

```bash
pnpm --filter @pixflow/editor dev
```
Expected output: `Local: http://localhost:5175` (or 5176 if 5175 is taken).

- [ ] **Step 11.2 — Manual checklist (in browser)**

Open the URL and verify each item. Take a screenshot if anything looks off.

1. **Empty state** — DropZone centered, no Inspector visible.
2. **Drop image** — viewport appears on the left, **Inspector appears as right column** (~320 px), Geometry + Color sections both open.
3. **Rotate 90° button** — image visibly rotates 90° clockwise; HistoryIndicator increments.
4. **Rotate 0° button** — image returns; HistoryIndicator increments again.
5. **Flip ⇆** — image mirrors horizontally; another history entry.
6. **Flip ⇅** — vertical flip stacks on top.
7. **Click & hold Brightness slider thumb, drag** — image visibly brightens/darkens during drag; HistoryIndicator does NOT increment until release.
8. **Release the brightness drag** — exactly ONE history entry added (`← N+1 · 0`).
9. **Double-click brightness row** — value resets to 0.00, image returns to original brightness, history increments by 1.
10. **Type into the brightness numeric input** (e.g. type `-0.5`, blur out) — image dims, history increments.
11. **Saturation slider, then Contrast slider, then Temp, then Tint** — each works the same way; image responds in real time.
12. **Collapse Color section** (click the header) — sliders hide; reopen — sliders return.
13. **Hard-refresh** — accordion remembers your last open/closed state. (Open both → reload → both open. Close Color → reload → Color stays closed.)
14. **Undo (⌘Z)** several times — every committed change reverts; sliders reflect the reverted values.
15. **Redo (⇧⌘Z)** — re-applies.
16. **Compare slider toggle (`/`)** — still works; with edits applied, half shows original / half shows edited.
17. **Console clean** — no React warnings, no Radix accessibility warnings, no PixflowError.

If a slider drag seems to push multiple history entries (one per emit), the bug is in `useSliderDrag` — `baselineRef` is being reset prematurely. Double-check Step 4.4 implementation.

- [ ] **Step 11.3 — Update memory snapshot**

Edit `/Users/buraksahin/.claude/projects/-Users-buraksahin-Desktop-pixflow-latest/memory/project_editor_rollout.md`:
- Mark PR #6 as ✅ merged with the merge commit hash (after Step 11.4).
- Update the editor package state list:
  - Add `src/components/inspector/`: Inspector.tsx, GeometrySection.tsx, ColorSection.tsx, InspectorSlider.tsx, Segmented.tsx
  - Add `src/hooks/`: useInspectorPrefs.ts, useSliderDrag.ts
  - Add `src/state/`: inspector-prefs.ts
  - Update test count: 85 → 96 (inspector-prefs 6, use-slider-drag 5)
  - Update Radix deps line: `@radix-ui/react-slider, react-accordion, react-toggle-group`
  - Update bundle size from the actual build output
  - Note that immer is NOW being used (no longer "installed but unused")
- Bump `🔜 PR #6` → ✅ and add `🔜 PR #7: Detail + Watermark sections (and crop tool)`.

Update `MEMORY.md` index entry to "PR #1–6 merged".

- [ ] **Step 11.4 — Final commit (memory snapshot is outside the repo, so this commit is just confirmation if the working tree has any leftover updates)**

If `git status` shows any uncommitted changes (it shouldn't, but check), commit them:
```bash
git status
```
If clean, no commit needed for this step. The plan doc itself was already committed earlier in the PR cycle (`docs: add PR #6 plan`).

---

## Verification gates summary

| Gate | When | How |
|---|---|---|
| Unit tests green | After Tasks 2 + 4 | `pnpm --filter @pixflow/editor test --run` — 11 new tests pass (6 inspector-prefs + 5 use-slider-drag) |
| Type-check clean | After Tasks 3, 5, 6, 7, 8, 9 | `pnpm --filter @pixflow/editor exec tsc --noEmit` — 0 errors |
| Bundle builds | After Task 10 | `pnpm --filter @pixflow/editor build` — succeeds; report new JS / gzip sizes |
| Browser smoke | Task 11 | All 17 checklist items pass; clean console |

---

## Risks & known sharp edges

- **Slider drag history hygiene.** The whole point of `useSliderDrag` is that one drag = one history entry. If the user drags brightness, the test in Task 4 verifies past has length 1 after onValueCommit. If the browser smoke shows multiple entries per drag, suspect `baselineRef` isn't sticking across the React state cycle (Strict Mode could cause an extra re-render that nulls it). The ref is module-stable across renders by React contract, so this should be safe — but if it bites, see PR #5's StrictMode lesson and consider stashing the baseline outside React state (e.g. via the store itself).
- **Radix Slider with `step={0.05}`.** The current value (e.g. 0.123 from a freshly-loaded preset) may not be a multiple of 0.05. Radix doesn't snap on mount — only on user interaction. So you'll see "0.12" in the numeric input briefly, then "0.10" or "0.15" once the user touches the thumb. That's a Radix invariant we accept; it matches Photoshop's behavior.
- **Numeric input commit on blur.** If the user types `0.55` and immediately tabs away, blur fires before any onValueChange — meaning `useSliderDrag.onValueCommit` runs with no baseline captured. The fallback path in Step 4.4 handles this: it just calls `commit(next)` (no baseline), which uses `present` as the past entry. Behaves like a single-shot click on the slider track. Documented in the hook's reset/commit comment.
- **Immer + readonly EditState.** `EditState` is `readonly` everywhere via `Readonly<...>` and `readonly` modifiers. Immer's `produce` returns a new object even from a draft that mutates readonly fields — TypeScript may complain about the assignment inside the producer. If `tsc` errors with "Cannot assign to 'brightness' because it is a read-only property", change the producer body to use `Object.assign(d.color, { brightness: v })` style, OR loosen the type by casting via `produce<EditState, EditState>`. Likely won't bite (immer's types use `WritableDraft<T>` which strips readonly), but flag this in case.
- **localStorage in private browsing.** Safari Private Mode throws on `localStorage.setItem`. Task 2's `savePrefs` swallows the error. Inspector still works; the only loss is inter-session persistence. Confirmed via the test "returns DEFAULT_PREFS (and does not throw) when stored JSON is malformed" — same defensive wrap applies on the write side.
- **DevStatePanel still present in the layout.** It's now below the viewport. Visually busy. Acceptable for PR #6 since the preset buttons are useful for fast smoke tests; PR #11 (export) is the natural place to retire it (replaced by the export modal).
