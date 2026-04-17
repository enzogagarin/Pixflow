# PR #4 — EditStore (zustand + immer) + History + Undo/Redo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce the editor's central store — a zustand+immer bound to an immutable `EditHistory` (past/present/future). Provides actions for loading an image, mutating the present state (for slider-drag previews) and committing to history (for slider-release snapshots), plus `undo`/`redo`. Ships a minimal interactive browser demo (drop-zone + preset buttons + live state preview + Cmd+Z/⇧Cmd+Z shortcut) so the store is verifiable without a canvas.

**Architecture:** A pure `history.ts` reducer (`createHistory`, `commit`, `setPresent`, `undo`, `redo`) with a hard cap of 50 entries wraps `EditState`. `store.ts` binds that reducer into a zustand v5 store using the `immer` middleware so future inspector components can mutate drafts ergonomically. The store keeps `document: EditHistory | null` — null means "no image loaded." UI components are intentionally small and built for the browser smoke test, not formal unit tests (components land properly in PR #5+ with canvas/inspector).

**Tech Stack:** zustand@^5.0.0, immer@^11.0.0, pixflow (workspace dep), React 19, Tailwind v4.

**Spec reference:** `docs/superpowers/specs/2026-04-17-pixflow-editor-architecture-design.md` Section 2 (history model + commit discipline), Section 7 (PR #4 row).

**Acceptance criteria for this PR:**

1. `history.ts` exports `createHistory`, `commit`, `setPresent`, `undo`, `redo`, and the constant `HISTORY_MAX` (=50). All functions are pure and immutable — input objects are never mutated.
2. The history reducer enforces a 50-entry cap via FIFO eviction on the `past` stack when a commit would exceed it.
3. `useEditStore` is a zustand hook with actions `loadImage`, `setPresent`, `commit`, `undo`, `redo`, `clear`. Actions are no-ops when `document` is null (no image loaded). `commit` accepts an optional `baseline` so sliders can push the pre-drag state instead of the latest `setPresent` value (the debounce-vs-commit discipline).
4. `useUndoRedoShortcuts()` hook registers window keyboard listeners for `Cmd/Ctrl+Z` (undo) and `Cmd/Ctrl+Shift+Z` (redo), ignoring the shortcut when focus is inside an `<input>`/`<textarea>`/`[contenteditable]`.
5. `HistoryIndicator` shows `"← N / M →"` (past count / future count) with reduced contrast when either count is 0.
6. `DropZone` accepts a dropped image file and calls `loadImage` with decoded bitmap + naturalWidth/Height. Empty exif is acceptable for this PR (real EXIF parsing lands in PR #11).
7. `DevStatePanel` renders a compact JSON preview of `document?.present` so users can visually confirm state changes during manual testing.
8. `App.tsx` integrates the above so the user can: drop an image → click "Apply forum-post preset" → see state change → Cmd+Z to revert → Cmd+Shift+Z to redo.
9. `pnpm --filter @pixflow/editor test` passes — ≥18 new tests covering history reducer + store actions (34 pre-existing + ≥18 new = ≥52 total).
10. `pnpm --filter @pixflow/editor typecheck` passes under strict TS.
11. `pnpm --filter @pixflow/editor build` still succeeds.
12. pixflow's 130 tests continue to pass (this PR doesn't touch `packages/pixflow/`).

---

## File structure after this PR

```
packages/editor/
├── package.json                       ← MODIFIED (add zustand + immer)
├── src/
│   ├── state/
│   │   ├── history.ts                 ← NEW (pure reducer)
│   │   ├── store.ts                   ← NEW (zustand + immer)
│   │   ├── types.ts                   ← unchanged (from PR #3)
│   │   ├── defaults.ts                ← unchanged
│   │   ├── presets.ts                 ← unchanged
│   │   └── remap-boxes.ts             ← unchanged
│   ├── hooks/
│   │   └── useUndoRedoShortcuts.ts    ← NEW
│   ├── components/
│   │   ├── WebGPUStatus.tsx           ← unchanged (from PR #2)
│   │   ├── HistoryIndicator.tsx       ← NEW
│   │   ├── DropZone.tsx               ← NEW
│   │   └── DevStatePanel.tsx          ← NEW
│   └── App.tsx                        ← MODIFIED
└── test/
    ├── history.test.ts                ← NEW
    ├── store.test.ts                  ← NEW
    └── (existing PR #3 test files)
```

---

## Task 1: Prepare branch + baseline

**Files:** none (git setup)

- [ ] **Step 1.1: Verify clean main + recent log**

Run:
```bash
git status --short
git log --oneline -4
```

Expected: no modified files; PR #3 merge visible at top.

- [ ] **Step 1.2: Run baseline**

```bash
pnpm --filter @pixflow/editor test 2>&1 | tail -5
pnpm --filter @pixflow/editor typecheck 2>&1 | tail -3
pnpm --filter pixflow test 2>&1 | tail -4
```

Expected: editor 34 tests pass; typecheck clean; pixflow 130 tests pass.

- [ ] **Step 1.3: Create branch**

```bash
git checkout -b feature/pr04-edit-store
git branch --show-current
```

Expected: `feature/pr04-edit-store`

---

## Task 2: Install zustand + immer

**Files:**
- Modify: `packages/editor/package.json` (deps added by pnpm)

- [ ] **Step 2.1: Install**

```bash
pnpm --filter @pixflow/editor add zustand@^5.0.0 immer@^11.0.0
```

Expected: both added under `dependencies` in `packages/editor/package.json`. zustand@5 requires React 18+ (we have 19, fine).

- [ ] **Step 2.2: Verify package.json**

```bash
grep -E "(zustand|immer)" packages/editor/package.json
```

Expected: two lines showing `"immer": "^11.x.x"` and `"zustand": "^5.x.x"` (or similar versions).

---

## Task 3: Write history.ts tests (TDD — test first)

**Files:**
- Create: `packages/editor/test/history.test.ts`

- [ ] **Step 3.1: Write comprehensive test file**

Create `packages/editor/test/history.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  createHistory,
  commit,
  setPresent,
  undo,
  redo,
  HISTORY_MAX,
} from '../src/state/history';
import { makeState } from './test-helpers';

describe('createHistory', () => {
  it('returns a history with no past/future and the given present', () => {
    const s = makeState();
    const h = createHistory(s);
    expect(h.past).toEqual([]);
    expect(h.present).toBe(s);
    expect(h.future).toEqual([]);
  });
});

describe('commit', () => {
  it('pushes current present to past, sets next as present, clears future', () => {
    const s0 = makeState();
    const s1 = makeState({
      color: { brightness: 0.1, contrast: 0, saturation: 0, whiteBalance: { temperature: 0, tint: 0 } },
    });
    const h0 = createHistory(s0);
    const h1 = commit(h0, s1);
    expect(h1.past).toEqual([s0]);
    expect(h1.present).toBe(s1);
    expect(h1.future).toEqual([]);
  });

  it('clears any pending future when a new commit is made (redo stack is invalidated)', () => {
    const s0 = makeState();
    const s1 = makeState({ color: { brightness: 0.1, contrast: 0, saturation: 0, whiteBalance: { temperature: 0, tint: 0 } } });
    const s2 = makeState({ color: { brightness: 0.2, contrast: 0, saturation: 0, whiteBalance: { temperature: 0, tint: 0 } } });
    const s3 = makeState({ color: { brightness: 0.3, contrast: 0, saturation: 0, whiteBalance: { temperature: 0, tint: 0 } } });

    let h = createHistory(s0);
    h = commit(h, s1);
    h = commit(h, s2);
    const undone = undo(h);
    expect(undone).not.toBeNull();
    // At this point: past=[s0], present=s1, future=[s2]
    expect(undone!.future).toHaveLength(1);
    // Commit something new — future should be wiped
    const next = commit(undone!, s3);
    expect(next.future).toEqual([]);
    expect(next.past).toEqual([s0, s1]);
    expect(next.present).toBe(s3);
  });

  it('does not mutate the input history', () => {
    const s0 = makeState();
    const s1 = makeState({ color: { brightness: 0.2, contrast: 0, saturation: 0, whiteBalance: { temperature: 0, tint: 0 } } });
    const h0 = createHistory(s0);
    const pastRef = h0.past;
    commit(h0, s1);
    expect(h0.present).toBe(s0);
    expect(h0.past).toBe(pastRef);
  });

  it(`caps past at HISTORY_MAX (${HISTORY_MAX}) via FIFO eviction`, () => {
    const initial = makeState();
    let h = createHistory(initial);
    // Commit HISTORY_MAX + 5 distinct states
    for (let i = 0; i < HISTORY_MAX + 5; i++) {
      const next = makeState({
        color: {
          brightness: i / 100,
          contrast: 0,
          saturation: 0,
          whiteBalance: { temperature: 0, tint: 0 },
        },
      });
      h = commit(h, next);
    }
    expect(h.past).toHaveLength(HISTORY_MAX);
    // The oldest five states (including the initial) should have been evicted
    // — the remaining past[0] should correspond to the 5th commit.
    expect(h.past[0]?.color.brightness).toBeCloseTo(5 / 100);
  });
});

describe('setPresent', () => {
  it('replaces present without touching past or future', () => {
    const s0 = makeState();
    const s1 = makeState({ color: { brightness: 0.5, contrast: 0, saturation: 0, whiteBalance: { temperature: 0, tint: 0 } } });
    const h0 = createHistory(s0);
    const h1 = setPresent(h0, s1);
    expect(h1.past).toBe(h0.past);
    expect(h1.present).toBe(s1);
    expect(h1.future).toBe(h0.future);
  });
});

describe('undo', () => {
  it('returns null when past is empty (no-op signal to caller)', () => {
    const h = createHistory(makeState());
    expect(undo(h)).toBeNull();
  });

  it('pops last past entry into present, pushes previous present to future head', () => {
    const s0 = makeState();
    const s1 = makeState({ color: { brightness: 0.1, contrast: 0, saturation: 0, whiteBalance: { temperature: 0, tint: 0 } } });
    const h1 = commit(createHistory(s0), s1);
    const h0 = undo(h1);
    expect(h0).not.toBeNull();
    expect(h0!.past).toEqual([]);
    expect(h0!.present).toBe(s0);
    expect(h0!.future).toEqual([s1]);
  });
});

describe('redo', () => {
  it('returns null when future is empty', () => {
    const h = createHistory(makeState());
    expect(redo(h)).toBeNull();
  });

  it('pops future head into present, pushes previous present to past tail', () => {
    const s0 = makeState();
    const s1 = makeState({ color: { brightness: 0.1, contrast: 0, saturation: 0, whiteBalance: { temperature: 0, tint: 0 } } });
    const afterCommit = commit(createHistory(s0), s1);
    const afterUndo = undo(afterCommit);
    expect(afterUndo).not.toBeNull();
    const afterRedo = redo(afterUndo!);
    expect(afterRedo).not.toBeNull();
    expect(afterRedo!.past).toEqual([s0]);
    expect(afterRedo!.present).toBe(s1);
    expect(afterRedo!.future).toEqual([]);
  });
});

describe('round-trip: commit → undo → redo returns equivalent history', () => {
  it('state identity is preserved (same object refs) across undo/redo cycle', () => {
    const s0 = makeState();
    const s1 = makeState({ color: { brightness: 0.1, contrast: 0, saturation: 0, whiteBalance: { temperature: 0, tint: 0 } } });
    const h1 = commit(createHistory(s0), s1);
    const h0 = undo(h1);
    const hBack = redo(h0!);
    expect(hBack!.present).toBe(s1);
    expect(hBack!.past[0]).toBe(s0);
  });
});
```

- [ ] **Step 3.2: Run tests — should fail**

```bash
pnpm --filter @pixflow/editor test 2>&1 | tail -6
```

Expected: module-not-found error on `../src/state/history`.

---

## Task 4: Implement history.ts

**Files:**
- Create: `packages/editor/src/state/history.ts`

- [ ] **Step 4.1: Write history.ts**

Create `packages/editor/src/state/history.ts`:

```typescript
import type { EditState } from './types';

/**
 * Hard cap on the number of undo entries retained. Each EditState is
 * ~500 bytes (everything except `source.bitmap` which is shared by
 * reference), so 50 entries costs ~25 KB — negligible against the app
 * memory budget. The bitmap is immutable for a session, so all history
 * entries share the same reference; snapshots never copy pixel data.
 */
export const HISTORY_MAX = 50;

export interface EditHistory {
  readonly past: readonly EditState[];
  readonly present: EditState;
  readonly future: readonly EditState[];
}

export function createHistory(initial: EditState): EditHistory {
  return { past: [], present: initial, future: [] };
}

/**
 * Push the current `present` to `past`, adopt `next` as the new `present`,
 * and clear `future` (redo stack is invalidated whenever a new edit branches
 * off from the past — the Vim-style "undo tree" is intentionally not a goal
 * here). Enforces HISTORY_MAX via FIFO eviction from the head of `past`.
 */
export function commit(history: EditHistory, next: EditState): EditHistory {
  const withCurrent = [...history.past, history.present];
  const trimmed =
    withCurrent.length > HISTORY_MAX
      ? withCurrent.slice(withCurrent.length - HISTORY_MAX)
      : withCurrent;
  return { past: trimmed, present: next, future: [] };
}

/**
 * Replace the present state in-place (no history push). Used by sliders
 * during drag: setPresent on every onInput keeps the preview responsive,
 * while a single commit fires on onChange (pointer release) to record
 * one history entry for the whole drag gesture.
 */
export function setPresent(history: EditHistory, next: EditState): EditHistory {
  return { past: history.past, present: next, future: history.future };
}

/**
 * Move one step back: pop the last past entry as the new present, and
 * push the current present onto the head of future. Returns null when
 * past is empty so callers can detect "nothing to undo" as a signal
 * rather than an exception.
 */
export function undo(history: EditHistory): EditHistory | null {
  if (history.past.length === 0) return null;
  const prev = history.past[history.past.length - 1];
  if (!prev) return null; // unreachable under noUncheckedIndexedAccess
  return {
    past: history.past.slice(0, -1),
    present: prev,
    future: [history.present, ...history.future],
  };
}

/**
 * Move one step forward: pop the head of future as the new present, and
 * append the current present to past. Returns null when future is empty.
 */
export function redo(history: EditHistory): EditHistory | null {
  if (history.future.length === 0) return null;
  const next = history.future[0];
  if (!next) return null; // unreachable under noUncheckedIndexedAccess
  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
  };
}
```

- [ ] **Step 4.2: Run tests — should pass**

```bash
pnpm --filter @pixflow/editor test 2>&1 | tail -8
```

Expected: 34 (prior) + ~11 (new history tests) = ~45 tests pass.

- [ ] **Step 4.3: Commit**

```bash
git add packages/editor/package.json packages/editor/src/state/history.ts packages/editor/test/history.test.ts
git commit -m "feat(editor): add pure history reducer (past/present/future) + tests (PR #4 part 1/4)"
```

---

## Task 5: Write store.ts tests (TDD)

**Files:**
- Create: `packages/editor/test/store.test.ts`

- [ ] **Step 5.1: Write store.test.ts**

Create `packages/editor/test/store.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useEditStore } from '../src/state/store';
import { makeState } from './test-helpers';

const dummyBitmap = {} as unknown as ImageBitmap;
const dummyFile = new File([], 'test.jpg', { type: 'image/jpeg' });

beforeEach(() => {
  useEditStore.getState().clear();
});

describe('useEditStore', () => {
  it('starts with document = null (no image loaded)', () => {
    expect(useEditStore.getState().document).toBeNull();
  });

  describe('loadImage', () => {
    it('seeds document with freshState wrapped in empty history', () => {
      useEditStore.getState().loadImage(dummyFile, dummyBitmap, {}, 1920, 1080);
      const doc = useEditStore.getState().document;
      expect(doc).not.toBeNull();
      expect(doc!.past).toEqual([]);
      expect(doc!.future).toEqual([]);
      expect(doc!.present.source.file).toBe(dummyFile);
      expect(doc!.present.source.naturalWidth).toBe(1920);
      expect(doc!.present.color.brightness).toBe(0);
    });

    it('replaces any existing document (opening a new file starts fresh)', () => {
      useEditStore.getState().loadImage(dummyFile, dummyBitmap, {}, 1920, 1080);
      const s1 = makeState({ color: { brightness: 0.2, contrast: 0, saturation: 0, whiteBalance: { temperature: 0, tint: 0 } } });
      useEditStore.getState().commit(s1);
      expect(useEditStore.getState().document!.past).toHaveLength(1);

      // Load a second image
      const dummyBitmap2 = {} as unknown as ImageBitmap;
      const dummyFile2 = new File([], 'other.jpg', { type: 'image/jpeg' });
      useEditStore.getState().loadImage(dummyFile2, dummyBitmap2, {}, 800, 600);
      const doc = useEditStore.getState().document!;
      expect(doc.past).toEqual([]);
      expect(doc.present.source.file).toBe(dummyFile2);
    });
  });

  describe('setPresent', () => {
    it('updates present without touching past or future', () => {
      useEditStore.getState().loadImage(dummyFile, dummyBitmap, {}, 1920, 1080);
      const before = useEditStore.getState().document!;
      const next = makeState({ color: { brightness: 0.5, contrast: 0, saturation: 0, whiteBalance: { temperature: 0, tint: 0 } } });
      useEditStore.getState().setPresent(next);
      const after = useEditStore.getState().document!;
      expect(after.present.color.brightness).toBe(0.5);
      expect(after.past).toBe(before.past);
      expect(after.future).toBe(before.future);
    });

    it('is a no-op when document is null', () => {
      const next = makeState();
      useEditStore.getState().setPresent(next);
      expect(useEditStore.getState().document).toBeNull();
    });
  });

  describe('commit', () => {
    it('pushes current present to past and sets next (default baseline path)', () => {
      useEditStore.getState().loadImage(dummyFile, dummyBitmap, {}, 1920, 1080);
      const original = useEditStore.getState().document!.present;
      const next = makeState({ color: { brightness: 0.3, contrast: 0, saturation: 0, whiteBalance: { temperature: 0, tint: 0 } } });
      useEditStore.getState().commit(next);
      const doc = useEditStore.getState().document!;
      expect(doc.past).toEqual([original]);
      expect(doc.present).toBe(next);
    });

    it('uses options.baseline when provided (slider-drag discipline)', () => {
      // Load image, then simulate: setPresent S1, setPresent S2, ..., commit(Sn, {baseline: S0})
      useEditStore.getState().loadImage(dummyFile, dummyBitmap, {}, 1920, 1080);
      const s0 = useEditStore.getState().document!.present;
      const s1 = makeState({ color: { brightness: 0.1, contrast: 0, saturation: 0, whiteBalance: { temperature: 0, tint: 0 } } });
      const s2 = makeState({ color: { brightness: 0.2, contrast: 0, saturation: 0, whiteBalance: { temperature: 0, tint: 0 } } });
      useEditStore.getState().setPresent(s1);
      useEditStore.getState().setPresent(s2);
      useEditStore.getState().commit(s2, { baseline: s0 });
      const doc = useEditStore.getState().document!;
      expect(doc.past).toEqual([s0]); // baseline pushed, not the mid-drag state
      expect(doc.present).toBe(s2);
    });

    it('is a no-op when document is null', () => {
      useEditStore.getState().commit(makeState());
      expect(useEditStore.getState().document).toBeNull();
    });
  });

  describe('undo / redo', () => {
    it('undo reverts to previous state; redo re-applies', () => {
      useEditStore.getState().loadImage(dummyFile, dummyBitmap, {}, 1920, 1080);
      const s0 = useEditStore.getState().document!.present;
      const s1 = makeState({ color: { brightness: 0.5, contrast: 0, saturation: 0, whiteBalance: { temperature: 0, tint: 0 } } });
      useEditStore.getState().commit(s1);

      useEditStore.getState().undo();
      expect(useEditStore.getState().document!.present).toBe(s0);

      useEditStore.getState().redo();
      expect(useEditStore.getState().document!.present).toBe(s1);
    });

    it('undo is a silent no-op when past is empty', () => {
      useEditStore.getState().loadImage(dummyFile, dummyBitmap, {}, 1920, 1080);
      const before = useEditStore.getState().document!;
      useEditStore.getState().undo();
      expect(useEditStore.getState().document).toBe(before);
    });

    it('redo is a silent no-op when future is empty', () => {
      useEditStore.getState().loadImage(dummyFile, dummyBitmap, {}, 1920, 1080);
      const before = useEditStore.getState().document!;
      useEditStore.getState().redo();
      expect(useEditStore.getState().document).toBe(before);
    });

    it('undo and redo are no-ops when document is null', () => {
      useEditStore.getState().undo();
      useEditStore.getState().redo();
      expect(useEditStore.getState().document).toBeNull();
    });
  });

  describe('clear', () => {
    it('resets document to null', () => {
      useEditStore.getState().loadImage(dummyFile, dummyBitmap, {}, 1920, 1080);
      expect(useEditStore.getState().document).not.toBeNull();
      useEditStore.getState().clear();
      expect(useEditStore.getState().document).toBeNull();
    });
  });
});
```

- [ ] **Step 5.2: Run tests — should fail (missing module)**

```bash
pnpm --filter @pixflow/editor test 2>&1 | tail -6
```

Expected: module-not-found error on `../src/state/store`.

---

## Task 6: Implement store.ts

**Files:**
- Create: `packages/editor/src/state/store.ts`

- [ ] **Step 6.1: Write store.ts**

Create `packages/editor/src/state/store.ts`:

```typescript
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { EditState, ExifTable } from './types';
import {
  createHistory,
  commit as historyCommit,
  setPresent as historySetPresent,
  undo as historyUndo,
  redo as historyRedo,
  type EditHistory,
} from './history';
import { freshState } from './defaults';

export interface CommitOptions {
  /**
   * State to push onto the `past` stack instead of the current `present`.
   * Used by slider drags: the caller tracks the pre-drag baseline and
   * passes it here on pointer-release so the history entry represents
   * the gesture's before/after, not the fine-grained mid-drag jitter.
   */
  readonly baseline?: EditState;
}

export interface EditorStore {
  readonly document: EditHistory | null;
  loadImage: (
    file: File,
    bitmap: ImageBitmap,
    exif: ExifTable,
    naturalWidth: number,
    naturalHeight: number,
  ) => void;
  setPresent: (next: EditState) => void;
  commit: (next: EditState, options?: CommitOptions) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
}

/**
 * Central editor store. zustand v5 with immer middleware: actions accept
 * a mutable draft, immer produces an immutable patch under the hood.
 * Current actions mostly delegate to the pure history reducer — immer
 * earns its weight when inspector components (PR #6) mutate nested
 * EditState shapes directly (e.g. setBrightness = draft.present.color.brightness = x).
 *
 * `document` is null until the first image is loaded. All mutation
 * actions are silent no-ops when document is null — they return early
 * without throwing so UI handlers can wire up keyboard shortcuts
 * without guarding each call site.
 */
export const useEditStore = create<EditorStore>()(
  immer((set) => ({
    document: null,

    loadImage: (file, bitmap, exif, naturalWidth, naturalHeight) => {
      set((state) => {
        state.document = createHistory(
          freshState(file, bitmap, exif, naturalWidth, naturalHeight),
        );
      });
    },

    setPresent: (next) => {
      set((state) => {
        if (!state.document) return;
        state.document = historySetPresent(state.document, next);
      });
    },

    commit: (next, options) => {
      set((state) => {
        if (!state.document) return;
        // If a baseline is provided, splice it into the past first by
        // setting present to baseline and then commit-ing next. This
        // produces past=[..., baseline], present=next, future=[].
        if (options?.baseline) {
          const withBaseline: EditHistory = {
            past: state.document.past,
            present: options.baseline,
            future: [],
          };
          state.document = historyCommit(withBaseline, next);
          return;
        }
        state.document = historyCommit(state.document, next);
      });
    },

    undo: () => {
      set((state) => {
        if (!state.document) return;
        const result = historyUndo(state.document);
        if (result) state.document = result;
      });
    },

    redo: () => {
      set((state) => {
        if (!state.document) return;
        const result = historyRedo(state.document);
        if (result) state.document = result;
      });
    },

    clear: () => {
      set((state) => {
        state.document = null;
      });
    },
  })),
);
```

- [ ] **Step 6.2: Run tests — should pass**

```bash
pnpm --filter @pixflow/editor test 2>&1 | tail -8
```

Expected: ~45 (prior) + ~14 (store tests) = ~59 tests pass.

- [ ] **Step 6.3: Typecheck**

```bash
pnpm --filter @pixflow/editor typecheck 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 6.4: Commit**

```bash
git add packages/editor/src/state/store.ts packages/editor/test/store.test.ts
git commit -m "feat(editor): add zustand+immer store with history actions (PR #4 part 2/4)"
```

---

## Task 7: Create useUndoRedoShortcuts hook

**Files:**
- Create: `packages/editor/src/hooks/useUndoRedoShortcuts.ts`

This hook is DOM-bound (attaches `window` listeners); we test it in the browser via Task 11 rather than with jsdom — the DX of adding `@testing-library` + jsdom for one hook isn't worth it.

- [ ] **Step 7.1: Write the hook**

Create `packages/editor/src/hooks/useUndoRedoShortcuts.ts`:

```typescript
import { useEffect } from 'react';
import { useEditStore } from '../state/store';

/**
 * Window-level keyboard shortcuts for undo/redo. Intentionally
 * ignores events fired from text-entry contexts so typing in an
 * <input>/<textarea>/[contenteditable] doesn't hijack Cmd+Z.
 *
 *   Cmd/Ctrl+Z           → undo
 *   Cmd/Ctrl+Shift+Z     → redo
 *
 * We deliberately do NOT support the Windows-y "Ctrl+Y = redo" variant
 * because the editor targets a cross-platform audience and consistent
 * shortcuts feel better than matching every OS's native idiom.
 */
export function useUndoRedoShortcuts(): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (isTypingTarget(e.target)) return;
      const modifier = e.metaKey || e.ctrlKey;
      if (!modifier) return;
      const key = e.key.toLowerCase();
      if (key !== 'z') return;
      e.preventDefault();
      if (e.shiftKey) {
        useEditStore.getState().redo();
      } else {
        useEditStore.getState().undo();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
  if (target.isContentEditable) return true;
  return false;
}
```

- [ ] **Step 7.2: Typecheck**

```bash
pnpm --filter @pixflow/editor typecheck 2>&1 | tail -3
```

Expected: clean.

---

## Task 8: Create HistoryIndicator component

**Files:**
- Create: `packages/editor/src/components/HistoryIndicator.tsx`

- [ ] **Step 8.1: Write the component**

Create `packages/editor/src/components/HistoryIndicator.tsx`:

```typescript
import { useEditStore } from '../state/store';

/**
 * Compact pill showing `← N   M →` where N is the undo-depth (past size)
 * and M is the redo-depth (future size). When either count is zero, that
 * half dims to indicate the shortcut won't do anything.
 *
 * Subscribes only to the two counts (via separate selectors) so it
 * re-renders on commit/undo/redo but NOT on setPresent (which leaves
 * past/future length unchanged).
 */
export function HistoryIndicator() {
  const pastLen = useEditStore((s) => s.document?.past.length ?? 0);
  const futureLen = useEditStore((s) => s.document?.future.length ?? 0);

  return (
    <div
      role="status"
      aria-label="Edit history"
      className="inline-flex items-center gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-1.5 font-[var(--font-mono)] text-xs"
    >
      <span
        className={
          pastLen > 0
            ? 'text-[var(--color-fg)]'
            : 'text-[var(--color-muted)] opacity-50'
        }
      >
        ← {pastLen}
      </span>
      <span className="text-[var(--color-muted)]">·</span>
      <span
        className={
          futureLen > 0
            ? 'text-[var(--color-fg)]'
            : 'text-[var(--color-muted)] opacity-50'
        }
      >
        {futureLen} →
      </span>
    </div>
  );
}
```

---

## Task 9: Create DropZone component

**Files:**
- Create: `packages/editor/src/components/DropZone.tsx`

- [ ] **Step 9.1: Write the component**

Create `packages/editor/src/components/DropZone.tsx`:

```typescript
import { useState, type DragEvent } from 'react';
import { useEditStore } from '../state/store';

/**
 * Minimal file drop target for PR #4's browser smoke test. Accepts the
 * first image file dropped, decodes it to an ImageBitmap, and calls
 * store.loadImage. Empty EXIF is passed — real parsing lands in PR #11.
 *
 * Errors (non-image file, decode failure) surface in a local
 * `message` state below the drop box. No toasts / modals yet; those
 * land with Radix integration in PR #6.
 */
export function DropZone() {
  const loadImage = useEditStore((s) => s.loadImage);
  const [active, setActive] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleFiles(files: FileList | null): Promise<void> {
    setMessage(null);
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setMessage(`"${file.name}" is not an image file.`);
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      loadImage(file, bitmap, {}, bitmap.width, bitmap.height);
      setMessage(
        `Loaded: ${file.name} · ${bitmap.width.toString()}×${bitmap.height.toString()}`,
      );
    } catch (err) {
      setMessage(`Failed to decode ${file.name}: ${String(err)}`);
    }
  }

  function onDragOver(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    setActive(true);
  }

  function onDragLeave(): void {
    setActive(false);
  }

  function onDrop(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    setActive(false);
    void handleFiles(e.dataTransfer.files);
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-2">
      <div
        role="button"
        tabIndex={0}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        aria-label="Drop an image file here to load it"
        className={`rounded-lg border border-dashed p-8 text-center transition-colors ${
          active
            ? 'border-[var(--color-accent)] bg-[var(--color-accent-dim)]'
            : 'border-[var(--color-border-strong)] bg-[var(--color-bg-elev-2)]'
        }`}
      >
        <p className="font-[var(--font-mono)] text-sm">Drop an image</p>
        <p className="mt-1 text-[11px] text-[var(--color-muted)]">
          everything stays in your browser
        </p>
      </div>
      {message !== null && (
        <p className="text-center font-[var(--font-mono)] text-[11px] text-[var(--color-muted)]">
          {message}
        </p>
      )}
    </div>
  );
}
```

---

## Task 10: Create DevStatePanel + preset demo

**Files:**
- Create: `packages/editor/src/components/DevStatePanel.tsx`

This panel shows the current state as JSON so the user can visually confirm `setPresent`/`commit`/`undo`/`redo` during browser testing. It's intentionally developer-facing — the real inspector with sliders lands in PR #6.

- [ ] **Step 10.1: Write DevStatePanel.tsx**

Create `packages/editor/src/components/DevStatePanel.tsx`:

```typescript
import { useEditStore } from '../state/store';
import { applyPreset } from '../state/presets';
import type { PresetName } from 'pixflow';

/**
 * Developer-facing panel for the PR #4 smoke test: displays the current
 * present state (minus the un-serializable source.bitmap) and offers
 * quick mutation buttons so the user can verify undo/redo works. Not
 * shipping in the final UI — replaced by the real inspector in PR #6.
 */
export function DevStatePanel() {
  const document = useEditStore((s) => s.document);
  const commit = useEditStore((s) => s.commit);
  const undo = useEditStore((s) => s.undo);
  const redo = useEditStore((s) => s.redo);

  if (!document) {
    return (
      <p className="font-[var(--font-mono)] text-xs text-[var(--color-muted)]">
        No document loaded. Drop an image above to begin.
      </p>
    );
  }

  const presets: readonly PresetName[] = [
    'forum-post',
    'ecommerce-thumbnail',
    'blog-hero',
    'avatar',
  ];

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {presets.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => commit(applyPreset(document.present, name))}
            className="rounded border border-[var(--color-border)] bg-[var(--color-bg-elev-2)] px-3 py-1.5 font-[var(--font-mono)] text-xs text-[var(--color-fg)] hover:border-[var(--color-accent)]"
          >
            {name}
          </button>
        ))}
        <button
          type="button"
          onClick={undo}
          className="rounded border border-[var(--color-border)] bg-[var(--color-bg-elev-2)] px-3 py-1.5 font-[var(--font-mono)] text-xs text-[var(--color-muted)] hover:border-[var(--color-accent-dim)]"
        >
          undo (⌘Z)
        </button>
        <button
          type="button"
          onClick={redo}
          className="rounded border border-[var(--color-border)] bg-[var(--color-bg-elev-2)] px-3 py-1.5 font-[var(--font-mono)] text-xs text-[var(--color-muted)] hover:border-[var(--color-accent-dim)]"
        >
          redo (⇧⌘Z)
        </button>
      </div>
      <pre className="max-h-80 overflow-auto rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elev-2)] p-3 font-[var(--font-mono)] text-[11px] leading-relaxed text-[var(--color-muted)]">
        {stringifyForDisplay(document)}
      </pre>
    </div>
  );
}

function stringifyForDisplay(document: unknown): string {
  // ImageBitmap and File don't JSON-serialize; replace them with stand-ins
  // so the panel stays readable without throwing.
  return JSON.stringify(
    document,
    (key, value) => {
      if (key === 'bitmap') return '[ImageBitmap]';
      if (key === 'file' && value && typeof value === 'object') {
        const f = value as File;
        return `[File: ${f.name} · ${f.size.toString()}B · ${f.type}]`;
      }
      return value;
    },
    2,
  );
}
```

---

## Task 11: Update App.tsx to integrate everything

**Files:**
- Modify: `packages/editor/src/App.tsx`

- [ ] **Step 11.1: Read current App.tsx**

```bash
cat packages/editor/src/App.tsx
```

- [ ] **Step 11.2: Rewrite App.tsx**

Overwrite `packages/editor/src/App.tsx` with:

```typescript
import { DevStatePanel } from './components/DevStatePanel';
import { DropZone } from './components/DropZone';
import { HistoryIndicator } from './components/HistoryIndicator';
import { WebGPUStatus } from './components/WebGPUStatus';
import { useUndoRedoShortcuts } from './hooks/useUndoRedoShortcuts';
import pixflowPkg from 'pixflow/package.json';

export function App() {
  useUndoRedoShortcuts();

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 px-6 py-12">
      <header className="flex items-center gap-3">
        <span className="font-[var(--font-mono)] text-2xl leading-none text-[var(--color-accent)]">
          ▤
        </span>
        <h1 className="font-[var(--font-mono)] text-2xl font-bold tracking-tight">
          Pixflow Editor
        </h1>
        <span className="rounded border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-2 py-[2px] font-[var(--font-mono)] text-xs text-[var(--color-muted)]">
          pre-alpha
        </span>
      </header>

      <p className="max-w-md text-center text-sm text-[var(--color-muted)]">
        Private, client-side photo editor. Nothing uploads, ever. This is the
        PR #4 smoke test: load an image, apply presets, try ⌘Z / ⇧⌘Z.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <WebGPUStatus />
        <HistoryIndicator />
      </div>

      <DropZone />
      <DevStatePanel />

      <footer className="mt-auto pt-8 font-[var(--font-mono)] text-[11px] text-[var(--color-muted)]">
        imported pixflow v{pixflowPkg.version}
      </footer>
    </main>
  );
}
```

- [ ] **Step 11.3: Typecheck + test**

```bash
pnpm --filter @pixflow/editor typecheck 2>&1 | tail -5
pnpm --filter @pixflow/editor test 2>&1 | tail -5
```

Expected: both clean.

- [ ] **Step 11.4: Commit**

```bash
git add packages/editor/src/hooks/ packages/editor/src/components/HistoryIndicator.tsx packages/editor/src/components/DropZone.tsx packages/editor/src/components/DevStatePanel.tsx packages/editor/src/App.tsx
git commit -m "feat(editor): wire DropZone + HistoryIndicator + keyboard shortcuts into App (PR #4 part 3/4)"
```

---

## Task 12: Browser smoke test

**Files:** none (manual verification)

- [ ] **Step 12.1: Start dev server**

```bash
pkill -f "vite" 2>/dev/null; sleep 1
pnpm --filter @pixflow/editor dev > /tmp/editor-dev.log 2>&1 &
disown
sleep 4
curl -sS http://localhost:5175/ -o /dev/null -w "HTTP %{http_code}\n"
```

Expected: `HTTP 200`.

- [ ] **Step 12.2: Manual browser verification**

Open http://localhost:5175/ and verify (ask user to confirm if this is an interactive session):

1. Page loads with header, WebGPU pill, **new** history indicator pill showing `← 0 · 0 →`
2. Drop an image file onto the drop zone → status text appears: `"Loaded: foo.jpg · 1920×1080"`
3. DevStatePanel replaces "No document loaded" with preset buttons + JSON preview of present state
4. Click `forum-post` button → JSON updates to show `output.resize.maxWidth: 1200`, `detail.sharpen: {...}`; indicator becomes `← 1 · 0 →`
5. Click `blog-hero` → JSON updates, indicator becomes `← 2 · 0 →`
6. Press Cmd+Z (Ctrl+Z on Windows) → JSON reverts to forum-post state; indicator becomes `← 1 · 1 →`
7. Press Cmd+Shift+Z → JSON re-applies blog-hero; indicator becomes `← 2 · 0 →`
8. Click `undo` button → same behavior as Cmd+Z
9. DevTools Console: no errors (Vite HMR logs are OK)

- [ ] **Step 12.3: Stop dev server**

```bash
pkill -f "vite" 2>/dev/null
```

---

## Task 13: Full-workspace verification

- [ ] **Step 13.1: Recursive test**

```bash
pnpm -r test 2>&1 | tail -12
```

Expected: pixflow 130/130 pass; editor ≥52 pass (34 prior + ≥18 new); editor-ml skipped; examples/vanilla-js no tests.

- [ ] **Step 13.2: Recursive typecheck**

```bash
pnpm -r typecheck 2>&1 | tail -12
```

Expected: pixflow/editor/editor-ml clean; vanilla-js shows the SAME pre-existing errors as before (requestAdapterInfo, compare possibly null).

- [ ] **Step 13.3: Editor build**

```bash
pnpm --filter @pixflow/editor build 2>&1 | tail -8
```

Expected: Vite emits hashed JS/CSS. JS bundle grows by ~15 KB from zustand+immer+new code.

---

## Task 14: Merge to main

- [ ] **Step 14.1: Review branch commits**

```bash
git log --oneline main..HEAD
```

Expected: three commits (history reducer; store; UI integration).

- [ ] **Step 14.2: Merge with --no-ff**

```bash
git checkout main
git merge feature/pr04-edit-store --no-ff -m "$(cat <<'EOF'
Merge 'feature/pr04-edit-store' (PR #4)

Introduce the editor's central zustand+immer store bound to an
immutable EditHistory (past/present/future, capped at 50 entries).
Ships a browser smoke test wired into App.tsx: drop an image, apply
presets, observe Cmd+Z / Cmd+Shift+Z round-trip through state.

The pure history reducer (history.ts) is fully unit-tested (~11 tests)
independent of zustand; the store (store.ts) gets its own ~14 tests
covering loadImage/setPresent/commit/undo/redo/clear including the
slider-drag baseline path. UI components (DropZone, HistoryIndicator,
DevStatePanel) are developer-facing scaffolding — replaced by the real
inspector in PR #6.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 14.3: Delete branch + log**

```bash
git branch -d feature/pr04-edit-store
git log --oneline -6
```

---

## Self-review checklist

- [ ] `pnpm --filter @pixflow/editor test` reports ≥52 tests passing
- [ ] `pnpm --filter @pixflow/editor typecheck` clean
- [ ] pixflow's 130 tests untouched
- [ ] history.ts is pure (no zustand/react imports) — verifiable via `grep -E "zustand|react" packages/editor/src/state/history.ts` producing no output
- [ ] Store actions are silent no-ops when document is null (no throws)
- [ ] Keyboard shortcuts ignore focus in input/textarea/contenteditable
- [ ] Browser smoke test passes: drop, commit, undo, redo all work visually

---

## What PR #4 explicitly does NOT include

- Canvas rendering / preview engine — PR #5
- Actual slider or knob components — PR #6 (inspector sections)
- Real EXIF parsing in DropZone — PR #11
- Metadata audit / export panel — PR #12
- PWA manifest — PR #14
- Face blur / ML — PR #10
- React component tests (requires @testing-library + jsdom) — deferred until there are enough components to justify the setup cost
- Fixing pre-existing vanilla-js typecheck errors — separate PR

---

## Known risks and mitigations

- **Risk:** zustand v5 shipped after many React 18 ecosystem tools; some peer-dep warnings possible.
  **Mitigation:** pnpm install already confirmed the React 19 peer without errors during PR #2. If new warnings appear, they're informational — behavior is verified by Task 12's browser smoke test.

- **Risk:** immer middleware's draft type can produce cryptic TS errors when combined with `readonly` EditState fields.
  **Mitigation:** Store actions assign entire sub-objects (e.g. `state.document = ...`) rather than mutating nested readonly fields. Nested draft mutation lands in PR #6 with inspector sliders; we'll add a helper pattern there.

- **Risk:** `useEditStore.getState()` inside the keyboard hook bypasses subscriptions, which is usually a footgun — but is correct here because the hook doesn't need to re-render on state changes.
  **Mitigation:** Documented in the hook's comment. Tests for the store cover the action side; the hook is verified in Task 12's browser smoke test.

- **Risk:** `createImageBitmap` throws synchronously for invalid image data in Safari, asynchronously elsewhere.
  **Mitigation:** DropZone wraps the call in `try/catch` and surfaces the error as a status message.
