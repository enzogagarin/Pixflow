# PR #3 — `stateToPipeline` Adapter + Unit Tests

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce the editor's `EditState` data model and a pure `stateToPipeline(state, mode)` adapter that translates an `EditState` snapshot into a configured pixflow `Pipeline`. Everything is synchronous, no-GPU, deterministic — the adapter is the single source of render truth that both preview and export engines will consume in later PRs. Covered by unit tests that assert every EditState field maps to the correct pixflow API call.

**Architecture:** `EditState` lives in `packages/editor/src/state/`, broken into small focused files: `types.ts` (interface + aliases), `defaults.ts` (`freshState()` factory), `presets.ts` (`applyPreset()`), `remap-boxes.ts` (`remapBoxesForCrop()` utility). The adapter lives at `packages/editor/src/render/state-to-pipeline.ts`. Tests use a factory-injection pattern: `stateToPipeline` accepts an optional `factory: () => Pipeline` defaulting to `Pipeline.create()`, so tests inject a mock pipeline and assert on its method calls. Face-blur wiring is intentionally deferred to PR #10 (after PR #8 adds `pixelate`/`regionBlur` filters to pixflow's public API).

**Tech Stack:** TypeScript 5.9, vitest 2, pixflow (workspace dep), React types (already installed in PR #2).

**Spec reference:** `docs/superpowers/specs/2026-04-17-pixflow-editor-architecture-design.md` Section 2 (EditState model), Section 3 (stateToPipeline), Section 7 (PR #3 row).

**Acceptance criteria for this PR:**

1. `packages/editor/src/state/types.ts` exports `EditState`, `FaceBox`, `MetadataStripSpec`, `WatermarkSpec`, `ExifTable` with the exact shape described in spec Section 2.
2. `freshState(file, bitmap, exif)` returns an `EditState` with safe defaults (metadata strip = `aggressive`, format = `image/webp`, quality = `0.9`, everything else zero/null).
3. `applyPreset(state, presetName)` merges preset parameters onto the state for the four named presets (forum-post, ecommerce-thumbnail, blog-hero, avatar).
4. `remapBoxesForCrop(boxes, crop)` translates face boxes from the original bitmap coordinate space to crop-space when a crop is active (a no-op slice when crop is null).
5. `stateToPipeline(state, mode)` returns a pixflow `Pipeline` with filters/encode applied in the order: geometry → color → detail → watermark → resize → encode. Preview mode uses `format: 'image/png'` + `quality: 1`; export mode uses `state.output.format` + `state.output.quality`.
6. Unit tests cover every EditState branch. `pnpm --filter @pixflow/editor test` runs via vitest and passes.
7. `pnpm --filter @pixflow/editor typecheck` passes under strict TypeScript (including `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`).
8. `pnpm --filter @pixflow/editor build` still succeeds (new source is import-safe for Vite build).
9. pixflow's 130 existing tests continue to pass — this PR doesn't touch `packages/pixflow/`.

---

## File structure after this PR

```
packages/editor/
├── vitest.config.ts              ← NEW
├── package.json                  ← MODIFIED (add vitest devdep + real test script)
├── src/
│   ├── state/
│   │   ├── types.ts              ← NEW (EditState + aliases)
│   │   ├── defaults.ts           ← NEW (freshState factory)
│   │   ├── presets.ts            ← NEW (applyPreset)
│   │   └── remap-boxes.ts        ← NEW (remapBoxesForCrop)
│   ├── render/
│   │   └── state-to-pipeline.ts  ← NEW (stateToPipeline adapter)
│   └── (existing files from PR #2 unchanged)
└── test/
    ├── test-helpers.ts           ← NEW (createMockPipeline, makeState helpers)
    ├── remap-boxes.test.ts       ← NEW
    ├── defaults.test.ts          ← NEW
    ├── presets.test.ts           ← NEW
    └── state-to-pipeline.test.ts ← NEW
```

---

## Task 1: Prepare working tree + feature branch

**Files:** none (git operation)

- [ ] **Step 1.1: Verify clean main + current state**

Run:
```bash
git status --short
git branch --show-current
git log --oneline -3
```

Expected: no modified files; branch is `main`; recent log shows the PR #2 merge at top.

If working tree has changes, commit or stash before proceeding.

- [ ] **Step 1.2: Baseline checks**

Run:
```bash
pnpm --filter pixflow test 2>&1 | tail -4
pnpm --filter @pixflow/editor typecheck 2>&1 | tail -3
pnpm --filter @pixflow/editor build 2>&1 | tail -4
```

Expected: pixflow 130/130 tests pass; editor typecheck clean; editor builds.

- [ ] **Step 1.3: Create branch**

```bash
git checkout -b feature/pr03-state-to-pipeline
git branch --show-current
```

Expected: `feature/pr03-state-to-pipeline`

---

## Task 2: Install vitest in the editor package

**Files:**
- Modify: `packages/editor/package.json` (adds devDep)

- [ ] **Step 2.1: Install vitest**

Run:
```bash
pnpm --filter @pixflow/editor add -D vitest@^2.1.0
```

Expected: vitest added to `packages/editor/package.json` devDependencies; lockfile updates.

- [ ] **Step 2.2: Verify install**

```bash
grep vitest packages/editor/package.json
```

Expected: a line like `"vitest": "^2.1.x"` appears.

---

## Task 3: Create vitest.config.ts

**Files:**
- Create: `packages/editor/vitest.config.ts`

- [ ] **Step 3.1: Write vitest config**

Create `packages/editor/vitest.config.ts` with:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globals: false,
  },
});
```

Same environment as pixflow (node). The adapter is pure — no DOM/ImageBitmap required for tests.

- [ ] **Step 3.2: Update package.json test script**

Open `packages/editor/package.json` and replace the `test` script.

Current:
```json
    "test": "echo 'editor has no unit tests yet (PR #3+); skipping' && exit 0"
```

New:
```json
    "test": "vitest run",
    "test:watch": "vitest"
```

(Note: `"test": "vitest run"` comes first; `"test:watch"` is added as a second line before the closing brace of `scripts`.)

- [ ] **Step 3.3: Verify vitest runs (with no tests yet)**

Run:
```bash
pnpm --filter @pixflow/editor test 2>&1 | tail -6
```

Expected: vitest reports "No test files found" or similar, exit code **non-zero** (this is OK — we just verified vitest is wired up). If vitest isn't found at all, re-check Task 2.

Actually vitest treats zero test files as an error. To keep `pnpm -r test` across the monorepo green while we're building up test files, add `--passWithNoTests` to the script:

Update `test` script to:
```json
    "test": "vitest run --passWithNoTests",
```

Re-run:
```bash
pnpm --filter @pixflow/editor test 2>&1 | tail -4
```

Expected: "No test files found, exiting with code 0" (or similar message), exit 0.

---

## Task 4: Create src/state/types.ts (EditState + aliases)

**Files:**
- Create: `packages/editor/src/state/types.ts`

- [ ] **Step 4.1: Write types.ts**

Create `packages/editor/src/state/types.ts` with:

```typescript
import type { WatermarkParams } from 'pixflow';

/**
 * Immutable snapshot of one image's edit state. Lives at the heart of the
 * editor: UI controls read/write this shape directly, and the render
 * adapter (`stateToPipeline`) consumes it to configure a pixflow pipeline.
 * See docs/superpowers/specs/2026-04-17-pixflow-editor-architecture-design.md
 * Section 2 for the design rationale.
 */
export interface EditState {
  readonly source: {
    readonly bitmap: ImageBitmap;
    readonly file: File;
    readonly exif: ExifTable;
    readonly naturalWidth: number;
    readonly naturalHeight: number;
  };

  readonly geometry: {
    readonly crop: CropRect | null;
    readonly rotate: 0 | 90 | 180 | 270;
    readonly flip: { readonly h: boolean; readonly v: boolean };
  };

  readonly color: {
    readonly brightness: number;
    readonly contrast: number;
    readonly saturation: number;
    readonly whiteBalance: {
      readonly temperature: number;
      readonly tint: number;
    };
  };

  readonly detail: {
    readonly sharpen: { readonly amount: number; readonly radius: number } | null;
    readonly blur: { readonly sigma: number } | null;
  };

  readonly watermark: WatermarkSpec | null;
  readonly faceBlur: FaceBlurState | null;

  readonly output: {
    readonly resize: ResizeSpec | null;
    readonly format: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif';
    readonly quality: number;
    readonly metadataStrip: MetadataStripSpec;
  };
}

export interface CropRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface ResizeSpec {
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly fit: 'inside' | 'cover';
}

export interface FaceBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly confidence: number;
}

export interface FaceBlurState {
  readonly boxes: readonly FaceBox[];
  readonly style: 'pixelate' | 'gaussian';
  readonly strength: number;
}

export interface MetadataStripSpec {
  readonly mode: 'aggressive' | 'minimal' | 'preserve';
}

/**
 * Loose EXIF placeholder. PR #11 (metadata strippers) replaces this with a
 * real parsed-EXIF shape from exifr. Until then we only need the identity
 * of the value when serializing, not its structured fields.
 */
export type ExifTable = Readonly<Record<string, unknown>>;

/** Re-exported for convenience; editor config uses pixflow's spec directly. */
export type WatermarkSpec = WatermarkParams;
```

- [ ] **Step 4.2: Verify typecheck**

Run:
```bash
pnpm --filter @pixflow/editor typecheck 2>&1 | tail -5
```

Expected: clean pass.

- [ ] **Step 4.3: Commit**

```bash
git add packages/editor/package.json packages/editor/vitest.config.ts packages/editor/src/state/types.ts pnpm-lock.yaml
git commit -m "feat(editor): add EditState types + vitest setup (PR #3 part 1/5)"
```

---

## Task 5: Implement src/state/defaults.ts (freshState factory)

**Files:**
- Create: `packages/editor/src/state/defaults.ts`
- Create: `packages/editor/test/test-helpers.ts`
- Create: `packages/editor/test/defaults.test.ts`

- [ ] **Step 5.1: Write test-helpers.ts**

Create `packages/editor/test/test-helpers.ts` with:

```typescript
import { vi } from 'vitest';
import type { Pipeline } from 'pixflow';
import type { EditState } from '../src/state/types';

/**
 * Mock Pipeline factory for adapter tests. Each method returns `this`
 * (the mock object) so fluent chains work. `vi.fn()` records every call
 * so tests can assert method name + arguments.
 */
export function createMockPipeline(): MockPipeline {
  const mock: MockPipeline = {
    crop: vi.fn(() => mock),
    rotate90: vi.fn(() => mock),
    flip: vi.fn(() => mock),
    brightness: vi.fn(() => mock),
    contrast: vi.fn(() => mock),
    saturation: vi.fn(() => mock),
    whiteBalance: vi.fn(() => mock),
    unsharpMask: vi.fn(() => mock),
    gaussianBlur: vi.fn(() => mock),
    watermark: vi.fn(() => mock),
    resize: vi.fn(() => mock),
    encode: vi.fn(() => mock),
  };
  return mock;
}

export interface MockPipeline {
  crop: ReturnType<typeof vi.fn>;
  rotate90: ReturnType<typeof vi.fn>;
  flip: ReturnType<typeof vi.fn>;
  brightness: ReturnType<typeof vi.fn>;
  contrast: ReturnType<typeof vi.fn>;
  saturation: ReturnType<typeof vi.fn>;
  whiteBalance: ReturnType<typeof vi.fn>;
  unsharpMask: ReturnType<typeof vi.fn>;
  gaussianBlur: ReturnType<typeof vi.fn>;
  watermark: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  encode: ReturnType<typeof vi.fn>;
}

/**
 * Build a minimal EditState for tests without needing a real ImageBitmap.
 * The adapter doesn't read source.bitmap/file/exif — only geometry/color/
 * detail/watermark/faceBlur/output — so a dummy source is safe.
 */
export function makeState(overrides: Partial<EditState> = {}): EditState {
  const base: EditState = {
    source: {
      bitmap: {} as unknown as ImageBitmap,
      file: {} as unknown as File,
      exif: {},
      naturalWidth: 4000,
      naturalHeight: 3000,
    },
    geometry: {
      crop: null,
      rotate: 0,
      flip: { h: false, v: false },
    },
    color: {
      brightness: 0,
      contrast: 0,
      saturation: 0,
      whiteBalance: { temperature: 0, tint: 0 },
    },
    detail: { sharpen: null, blur: null },
    watermark: null,
    faceBlur: null,
    output: {
      resize: null,
      format: 'image/webp',
      quality: 0.9,
      metadataStrip: { mode: 'aggressive' },
    },
  };
  return { ...base, ...overrides };
}

/**
 * Cast helper. The adapter accepts a factory `() => Pipeline`; tests need
 * to hand over a MockPipeline while the type signature expects Pipeline.
 */
export function asPipelineFactory(mock: MockPipeline): () => Pipeline {
  return () => mock as unknown as Pipeline;
}
```

- [ ] **Step 5.2: Write failing test**

Create `packages/editor/test/defaults.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { freshState } from '../src/state/defaults';

const dummyBitmap = {} as unknown as ImageBitmap;
const dummyFile = new File([], 'test.jpg', { type: 'image/jpeg' });

describe('freshState', () => {
  it('returns state with all filter params zeroed and outputs set to aggressive privacy defaults', () => {
    const s = freshState(dummyFile, dummyBitmap, {}, 4000, 3000);

    expect(s.source.file).toBe(dummyFile);
    expect(s.source.bitmap).toBe(dummyBitmap);
    expect(s.source.exif).toEqual({});
    expect(s.source.naturalWidth).toBe(4000);
    expect(s.source.naturalHeight).toBe(3000);

    expect(s.geometry).toEqual({
      crop: null,
      rotate: 0,
      flip: { h: false, v: false },
    });
    expect(s.color).toEqual({
      brightness: 0,
      contrast: 0,
      saturation: 0,
      whiteBalance: { temperature: 0, tint: 0 },
    });
    expect(s.detail).toEqual({ sharpen: null, blur: null });
    expect(s.watermark).toBeNull();
    expect(s.faceBlur).toBeNull();

    expect(s.output.resize).toBeNull();
    expect(s.output.format).toBe('image/webp');
    expect(s.output.quality).toBe(0.9);
    expect(s.output.metadataStrip.mode).toBe('aggressive');
  });

  it('reads naturalWidth/Height from args (not from bitmap)', () => {
    const s = freshState(dummyFile, dummyBitmap, {}, 1920, 1080);
    expect(s.source.naturalWidth).toBe(1920);
    expect(s.source.naturalHeight).toBe(1080);
  });
});
```

- [ ] **Step 5.3: Run test to verify it fails**

```bash
pnpm --filter @pixflow/editor test 2>&1 | tail -10
```

Expected: FAIL with "Cannot find module '../src/state/defaults'" or similar import error.

- [ ] **Step 5.4: Implement defaults.ts**

Create `packages/editor/src/state/defaults.ts`:

```typescript
import type { EditState, ExifTable } from './types';

/**
 * Build a fresh EditState for a newly-loaded image. The defaults reflect
 * the editor's privacy-first posture (metadata strip = aggressive, format
 * = webp at quality 0.9) and the identity of every filter parameter
 * (everything zero/null so the pipeline is a pure re-encode until the
 * user touches a control).
 */
export function freshState(
  file: File,
  bitmap: ImageBitmap,
  exif: ExifTable,
  naturalWidth: number,
  naturalHeight: number,
): EditState {
  return {
    source: { bitmap, file, exif, naturalWidth, naturalHeight },
    geometry: {
      crop: null,
      rotate: 0,
      flip: { h: false, v: false },
    },
    color: {
      brightness: 0,
      contrast: 0,
      saturation: 0,
      whiteBalance: { temperature: 0, tint: 0 },
    },
    detail: { sharpen: null, blur: null },
    watermark: null,
    faceBlur: null,
    output: {
      resize: null,
      format: 'image/webp',
      quality: 0.9,
      metadataStrip: { mode: 'aggressive' },
    },
  };
}
```

- [ ] **Step 5.5: Run test to verify it passes**

```bash
pnpm --filter @pixflow/editor test 2>&1 | tail -10
```

Expected: 2/2 tests pass.

- [ ] **Step 5.6: Commit**

```bash
git add packages/editor/src/state/defaults.ts packages/editor/test/test-helpers.ts packages/editor/test/defaults.test.ts
git commit -m "feat(editor): add freshState factory + test helpers (PR #3 part 2/5)"
```

---

## Task 6: Implement src/state/remap-boxes.ts

**Files:**
- Create: `packages/editor/src/state/remap-boxes.ts`
- Create: `packages/editor/test/remap-boxes.test.ts`

- [ ] **Step 6.1: Write failing test**

Create `packages/editor/test/remap-boxes.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { remapBoxesForCrop } from '../src/state/remap-boxes';
import type { FaceBox, CropRect } from '../src/state/types';

describe('remapBoxesForCrop', () => {
  it('returns a fresh array copy when crop is null (no mutation of input)', () => {
    const boxes: FaceBox[] = [
      { x: 100, y: 100, w: 50, h: 50, confidence: 0.9 },
    ];
    const result = remapBoxesForCrop(boxes, null);
    expect(result).toEqual(boxes);
    expect(result).not.toBe(boxes);
  });

  it('translates box coordinates by the crop origin', () => {
    const boxes: FaceBox[] = [
      { x: 300, y: 200, w: 50, h: 60, confidence: 0.9 },
    ];
    const crop: CropRect = { x: 100, y: 80, w: 400, h: 300 };
    const result = remapBoxesForCrop(boxes, crop);
    expect(result).toEqual([
      { x: 200, y: 120, w: 50, h: 60, confidence: 0.9 },
    ]);
  });

  it('preserves width, height, and confidence under translation', () => {
    const boxes: FaceBox[] = [
      { x: 500, y: 400, w: 77, h: 88, confidence: 0.71 },
    ];
    const crop: CropRect = { x: 250, y: 250, w: 800, h: 600 };
    const result = remapBoxesForCrop(boxes, crop);
    expect(result[0]?.w).toBe(77);
    expect(result[0]?.h).toBe(88);
    expect(result[0]?.confidence).toBe(0.71);
  });

  it('handles multiple boxes', () => {
    const boxes: FaceBox[] = [
      { x: 100, y: 100, w: 50, h: 50, confidence: 0.95 },
      { x: 300, y: 150, w: 40, h: 40, confidence: 0.82 },
    ];
    const crop: CropRect = { x: 50, y: 50, w: 400, h: 300 };
    const result = remapBoxesForCrop(boxes, crop);
    expect(result).toHaveLength(2);
    expect(result[0]?.x).toBe(50);
    expect(result[0]?.y).toBe(50);
    expect(result[1]?.x).toBe(250);
    expect(result[1]?.y).toBe(100);
  });

  it('returns an empty array for empty input regardless of crop', () => {
    expect(remapBoxesForCrop([], null)).toEqual([]);
    expect(remapBoxesForCrop([], { x: 10, y: 10, w: 100, h: 100 })).toEqual([]);
  });
});
```

- [ ] **Step 6.2: Run test to verify failure**

```bash
pnpm --filter @pixflow/editor test 2>&1 | tail -6
```

Expected: module-not-found failure.

- [ ] **Step 6.3: Implement remap-boxes.ts**

Create `packages/editor/src/state/remap-boxes.ts`:

```typescript
import type { CropRect, FaceBox } from './types';

/**
 * Translate face boxes from the original bitmap coordinate space into the
 * post-crop coordinate space. Width, height, and confidence are preserved;
 * only x and y are shifted by the crop origin. When no crop is active,
 * returns a shallow copy so callers can freely mutate.
 *
 * This function does NOT clip boxes that fall outside the crop rectangle —
 * the pipeline's filter will harmlessly write off-bounds dispatches, and
 * Canvas2D fallbacks clip at compose time. If strict clipping becomes
 * necessary (e.g. to avoid wasted GPU work on fully-outside boxes), that's
 * a future optimization.
 */
export function remapBoxesForCrop(
  boxes: readonly FaceBox[],
  crop: CropRect | null,
): FaceBox[] {
  if (!crop) return boxes.slice();
  return boxes.map((box) => ({
    x: box.x - crop.x,
    y: box.y - crop.y,
    w: box.w,
    h: box.h,
    confidence: box.confidence,
  }));
}
```

- [ ] **Step 6.4: Run test to verify pass**

```bash
pnpm --filter @pixflow/editor test 2>&1 | tail -6
```

Expected: all tests pass (2 from defaults.test.ts + 5 from remap-boxes.test.ts = 7).

- [ ] **Step 6.5: Commit**

```bash
git add packages/editor/src/state/remap-boxes.ts packages/editor/test/remap-boxes.test.ts
git commit -m "feat(editor): add remapBoxesForCrop utility + tests (PR #3 part 3/5)"
```

---

## Task 7: Implement src/state/presets.ts

**Files:**
- Create: `packages/editor/src/state/presets.ts`
- Create: `packages/editor/test/presets.test.ts`

- [ ] **Step 7.1: Write failing test**

Create `packages/editor/test/presets.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { applyPreset } from '../src/state/presets';
import { makeState } from './test-helpers';

describe('applyPreset', () => {
  it("applies forum-post: inside-fit resize to 1200 + mild sharpen, keeps webp", () => {
    const s = applyPreset(makeState(), 'forum-post');
    expect(s.output.resize).toEqual({ maxWidth: 1200, fit: 'inside' });
    expect(s.detail.sharpen).toEqual({ amount: 0.3, radius: 1 });
    expect(s.output.format).toBe('image/webp');
  });

  it('applies ecommerce-thumbnail: 600x600 cover + stronger sharpen', () => {
    const s = applyPreset(makeState(), 'ecommerce-thumbnail');
    expect(s.output.resize).toEqual({ maxWidth: 600, maxHeight: 600, fit: 'cover' });
    expect(s.detail.sharpen).toEqual({ amount: 0.5, radius: 1 });
  });

  it('applies blog-hero: 1600x900 cover + saturation boost + mild sharpen', () => {
    const s = applyPreset(makeState(), 'blog-hero');
    expect(s.output.resize).toEqual({ maxWidth: 1600, maxHeight: 900, fit: 'cover' });
    expect(s.color.saturation).toBeCloseTo(0.1);
    expect(s.detail.sharpen).toEqual({ amount: 0.25, radius: 1 });
  });

  it('applies avatar: 256x256 cover + stronger sharpen', () => {
    const s = applyPreset(makeState(), 'avatar');
    expect(s.output.resize).toEqual({ maxWidth: 256, maxHeight: 256, fit: 'cover' });
    expect(s.detail.sharpen).toEqual({ amount: 0.4, radius: 1 });
  });

  it("preserves fields the preset doesn't mention (e.g. user's metadata strip choice)", () => {
    const base = makeState({
      output: {
        resize: null,
        format: 'image/webp',
        quality: 0.9,
        metadataStrip: { mode: 'preserve' },
      },
    });
    const s = applyPreset(base, 'forum-post');
    expect(s.output.metadataStrip.mode).toBe('preserve');
  });

  it('does not mutate the input state', () => {
    const base = makeState();
    const before = JSON.stringify({ ...base, source: null });
    applyPreset(base, 'avatar');
    const after = JSON.stringify({ ...base, source: null });
    expect(after).toBe(before);
  });
});
```

- [ ] **Step 7.2: Run test to verify failure**

```bash
pnpm --filter @pixflow/editor test 2>&1 | tail -6
```

Expected: module-not-found failure.

- [ ] **Step 7.3: Implement presets.ts**

Create `packages/editor/src/state/presets.ts`:

```typescript
import type { PresetName } from 'pixflow';
import type { EditState } from './types';

/**
 * Starting-point preset application. Merges preset-specific parameters
 * (resize, sharpen, saturation) onto an existing state; fields the preset
 * doesn't touch (user's metadata strip choice, crop, rotate, etc.) are
 * preserved. Presets match pixflow's `PRESETS` dictionary semantically
 * but express themselves as EditState patches rather than Pipeline calls.
 */
export function applyPreset(state: EditState, preset: PresetName): EditState {
  switch (preset) {
    case 'forum-post':
      return {
        ...state,
        detail: { ...state.detail, sharpen: { amount: 0.3, radius: 1 } },
        output: { ...state.output, resize: { maxWidth: 1200, fit: 'inside' } },
      };

    case 'ecommerce-thumbnail':
      return {
        ...state,
        detail: { ...state.detail, sharpen: { amount: 0.5, radius: 1 } },
        output: {
          ...state.output,
          resize: { maxWidth: 600, maxHeight: 600, fit: 'cover' },
        },
      };

    case 'blog-hero':
      return {
        ...state,
        color: { ...state.color, saturation: 0.1 },
        detail: { ...state.detail, sharpen: { amount: 0.25, radius: 1 } },
        output: {
          ...state.output,
          resize: { maxWidth: 1600, maxHeight: 900, fit: 'cover' },
        },
      };

    case 'avatar':
      return {
        ...state,
        detail: { ...state.detail, sharpen: { amount: 0.4, radius: 1 } },
        output: {
          ...state.output,
          resize: { maxWidth: 256, maxHeight: 256, fit: 'cover' },
        },
      };
  }
}
```

- [ ] **Step 7.4: Run test to verify pass**

```bash
pnpm --filter @pixflow/editor test 2>&1 | tail -8
```

Expected: 13/13 tests pass (2 defaults + 5 remap + 6 presets).

- [ ] **Step 7.5: Commit**

```bash
git add packages/editor/src/state/presets.ts packages/editor/test/presets.test.ts
git commit -m "feat(editor): add applyPreset with four named presets + tests (PR #3 part 4/5)"
```

---

## Task 8: Implement src/render/state-to-pipeline.ts

**Files:**
- Create: `packages/editor/src/render/state-to-pipeline.ts`
- Create: `packages/editor/test/state-to-pipeline.test.ts`

- [ ] **Step 8.1: Write failing test suite for geometry branch**

Create `packages/editor/test/state-to-pipeline.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { stateToPipeline } from '../src/render/state-to-pipeline';
import { asPipelineFactory, createMockPipeline, makeState } from './test-helpers';

describe('stateToPipeline — geometry', () => {
  it('omits all geometry calls when crop=null, rotate=0, flip=false/false', () => {
    const mock = createMockPipeline();
    stateToPipeline(makeState(), 'export', asPipelineFactory(mock));
    expect(mock.crop).not.toHaveBeenCalled();
    expect(mock.rotate90).not.toHaveBeenCalled();
    expect(mock.flip).not.toHaveBeenCalled();
  });

  it('applies crop before rotate before flip (order matters)', () => {
    const mock = createMockPipeline();
    const s = makeState({
      geometry: {
        crop: { x: 10, y: 20, w: 100, h: 200 },
        rotate: 90,
        flip: { h: true, v: false },
      },
    });
    stateToPipeline(s, 'export', asPipelineFactory(mock));
    expect(mock.crop).toHaveBeenCalledWith({ x: 10, y: 20, w: 100, h: 200 });
    expect(mock.rotate90).toHaveBeenCalledWith(1);
    expect(mock.flip).toHaveBeenCalledWith('horizontal');
    // Ordering: crop invoked before rotate invoked before flip
    const cropOrder = mock.crop.mock.invocationCallOrder[0]!;
    const rotateOrder = mock.rotate90.mock.invocationCallOrder[0]!;
    const flipOrder = mock.flip.mock.invocationCallOrder[0]!;
    expect(cropOrder).toBeLessThan(rotateOrder);
    expect(rotateOrder).toBeLessThan(flipOrder);
  });

  it('maps rotate=90 to rotate90(1), rotate=180 to rotate90(2), rotate=270 to rotate90(3)', () => {
    for (const [deg, turns] of [
      [90, 1],
      [180, 2],
      [270, 3],
    ] as const) {
      const mock = createMockPipeline();
      const s = makeState({
        geometry: { crop: null, rotate: deg, flip: { h: false, v: false } },
      });
      stateToPipeline(s, 'export', asPipelineFactory(mock));
      expect(mock.rotate90).toHaveBeenCalledWith(turns);
    }
  });

  it('calls flip twice when both h and v are true', () => {
    const mock = createMockPipeline();
    const s = makeState({
      geometry: { crop: null, rotate: 0, flip: { h: true, v: true } },
    });
    stateToPipeline(s, 'export', asPipelineFactory(mock));
    expect(mock.flip).toHaveBeenCalledWith('horizontal');
    expect(mock.flip).toHaveBeenCalledWith('vertical');
    expect(mock.flip).toHaveBeenCalledTimes(2);
  });
});

describe('stateToPipeline — color', () => {
  it('skips identity color filters (all params zero)', () => {
    const mock = createMockPipeline();
    stateToPipeline(makeState(), 'export', asPipelineFactory(mock));
    expect(mock.brightness).not.toHaveBeenCalled();
    expect(mock.contrast).not.toHaveBeenCalled();
    expect(mock.saturation).not.toHaveBeenCalled();
    expect(mock.whiteBalance).not.toHaveBeenCalled();
  });

  it('applies brightness/contrast/saturation when non-zero', () => {
    const mock = createMockPipeline();
    const s = makeState({
      color: {
        brightness: 0.2,
        contrast: -0.1,
        saturation: 0.05,
        whiteBalance: { temperature: 0, tint: 0 },
      },
    });
    stateToPipeline(s, 'export', asPipelineFactory(mock));
    expect(mock.brightness).toHaveBeenCalledWith(0.2);
    expect(mock.contrast).toHaveBeenCalledWith(-0.1);
    expect(mock.saturation).toHaveBeenCalledWith(0.05);
  });

  it('applies whiteBalance when temperature OR tint is non-zero', () => {
    const tempOnly = createMockPipeline();
    stateToPipeline(
      makeState({
        color: {
          brightness: 0,
          contrast: 0,
          saturation: 0,
          whiteBalance: { temperature: 0.1, tint: 0 },
        },
      }),
      'export',
      asPipelineFactory(tempOnly),
    );
    expect(tempOnly.whiteBalance).toHaveBeenCalledWith({ temperature: 0.1, tint: 0 });

    const tintOnly = createMockPipeline();
    stateToPipeline(
      makeState({
        color: {
          brightness: 0,
          contrast: 0,
          saturation: 0,
          whiteBalance: { temperature: 0, tint: -0.05 },
        },
      }),
      'export',
      asPipelineFactory(tintOnly),
    );
    expect(tintOnly.whiteBalance).toHaveBeenCalledWith({ temperature: 0, tint: -0.05 });
  });
});

describe('stateToPipeline — detail', () => {
  it('skips sharpen when null', () => {
    const mock = createMockPipeline();
    stateToPipeline(makeState(), 'export', asPipelineFactory(mock));
    expect(mock.unsharpMask).not.toHaveBeenCalled();
  });

  it('applies sharpen when set', () => {
    const mock = createMockPipeline();
    stateToPipeline(
      makeState({
        detail: { sharpen: { amount: 0.5, radius: 1.5 }, blur: null },
      }),
      'export',
      asPipelineFactory(mock),
    );
    expect(mock.unsharpMask).toHaveBeenCalledWith({ amount: 0.5, radius: 1.5 });
  });

  it('skips blur when null', () => {
    const mock = createMockPipeline();
    stateToPipeline(makeState(), 'export', asPipelineFactory(mock));
    expect(mock.gaussianBlur).not.toHaveBeenCalled();
  });

  it('applies blur when set', () => {
    const mock = createMockPipeline();
    stateToPipeline(
      makeState({
        detail: { sharpen: null, blur: { sigma: 3 } },
      }),
      'export',
      asPipelineFactory(mock),
    );
    expect(mock.gaussianBlur).toHaveBeenCalledWith({ sigma: 3 });
  });
});

describe('stateToPipeline — watermark', () => {
  it('skips watermark when null', () => {
    const mock = createMockPipeline();
    stateToPipeline(makeState(), 'export', asPipelineFactory(mock));
    expect(mock.watermark).not.toHaveBeenCalled();
  });

  it('forwards watermark spec verbatim when set', () => {
    const mock = createMockPipeline();
    const wmImage = {} as unknown as ImageBitmap;
    const wm = { image: wmImage, position: 'bottom-right' as const, opacity: 0.3, scale: 0.15 };
    stateToPipeline(
      makeState({ watermark: wm }),
      'export',
      asPipelineFactory(mock),
    );
    expect(mock.watermark).toHaveBeenCalledWith(wm);
  });
});

describe('stateToPipeline — output + modes', () => {
  it('skips resize when null', () => {
    const mock = createMockPipeline();
    stateToPipeline(makeState(), 'export', asPipelineFactory(mock));
    expect(mock.resize).not.toHaveBeenCalled();
  });

  it('forwards resize spec when set', () => {
    const mock = createMockPipeline();
    stateToPipeline(
      makeState({
        output: {
          resize: { maxWidth: 1200, fit: 'inside' },
          format: 'image/webp',
          quality: 0.9,
          metadataStrip: { mode: 'aggressive' },
        },
      }),
      'export',
      asPipelineFactory(mock),
    );
    expect(mock.resize).toHaveBeenCalledWith({ maxWidth: 1200, fit: 'inside' });
  });

  it('in export mode, encode uses state.output.format + quality', () => {
    const mock = createMockPipeline();
    stateToPipeline(
      makeState({
        output: {
          resize: null,
          format: 'image/jpeg',
          quality: 0.85,
          metadataStrip: { mode: 'aggressive' },
        },
      }),
      'export',
      asPipelineFactory(mock),
    );
    expect(mock.encode).toHaveBeenCalledWith({ format: 'image/jpeg', quality: 0.85 });
  });

  it("in preview mode, encode uses image/png at quality=1 regardless of state.output", () => {
    const mock = createMockPipeline();
    stateToPipeline(
      makeState({
        output: {
          resize: null,
          format: 'image/jpeg',
          quality: 0.5,
          metadataStrip: { mode: 'aggressive' },
        },
      }),
      'preview',
      asPipelineFactory(mock),
    );
    expect(mock.encode).toHaveBeenCalledWith({ format: 'image/png', quality: 1 });
  });

  it('encode is always the final call', () => {
    const mock = createMockPipeline();
    const s = makeState({
      color: { brightness: 0.1, contrast: 0, saturation: 0, whiteBalance: { temperature: 0, tint: 0 } },
      output: {
        resize: { maxWidth: 800, fit: 'inside' },
        format: 'image/webp',
        quality: 0.82,
        metadataStrip: { mode: 'aggressive' },
      },
    });
    stateToPipeline(s, 'export', asPipelineFactory(mock));
    const encodeOrder = mock.encode.mock.invocationCallOrder[0]!;
    const brightnessOrder = mock.brightness.mock.invocationCallOrder[0]!;
    const resizeOrder = mock.resize.mock.invocationCallOrder[0]!;
    expect(brightnessOrder).toBeLessThan(encodeOrder);
    expect(resizeOrder).toBeLessThan(encodeOrder);
  });
});

describe('stateToPipeline — return value', () => {
  it('returns the pipeline built by the factory', () => {
    const mock = createMockPipeline();
    const result = stateToPipeline(makeState(), 'export', asPipelineFactory(mock));
    expect(result).toBe(mock);
  });
});
```

- [ ] **Step 8.2: Run test to verify failure**

```bash
pnpm --filter @pixflow/editor test 2>&1 | tail -6
```

Expected: module-not-found failure on `'../src/render/state-to-pipeline'`.

- [ ] **Step 8.3: Implement state-to-pipeline.ts**

Create `packages/editor/src/render/state-to-pipeline.ts`:

```typescript
import { Pipeline } from 'pixflow';
import type { EditState } from '../state/types';

export type RenderMode = 'preview' | 'export';

/**
 * Translate an EditState snapshot into a pixflow Pipeline, ready to accept
 * a source via .run(). This function is pure and synchronous — no GPU is
 * touched here. The adapter is the single source of render truth: the
 * editor's preview engine and export engine both call this function so
 * "preview ≠ export" divergence is architecturally impossible.
 *
 * Mode semantics:
 *   - 'preview' forces format=png + quality=1 for the fastest path to a
 *     visually-correct canvas. Preview metadata strip is NOT performed
 *     here (preview never leaves the editor).
 *   - 'export' honors state.output.format + quality. Metadata stripping
 *     happens downstream, after encode, in the export engine (PR #11).
 *
 * Face-blur wiring is intentionally omitted: it requires pixflow's
 * `pixelate` and `regionBlur` filters which land in PR #8, and the
 * full safety-reviewed face-detect flow lands in PR #10. Until then,
 * `state.faceBlur` is ignored by this adapter.
 *
 * Filter order (spec Section 3):
 *   geometry (crop → rotate → flip) → color → detail → watermark → resize → encode
 */
export function stateToPipeline(
  state: EditState,
  mode: RenderMode,
  factory: () => Pipeline = () => Pipeline.create(),
): Pipeline {
  const p = factory();

  // 1. Geometry: crop → rotate → flip
  if (state.geometry.crop) {
    p.crop(state.geometry.crop);
  }
  if (state.geometry.rotate !== 0) {
    p.rotate90((state.geometry.rotate / 90) as 1 | 2 | 3);
  }
  if (state.geometry.flip.h) p.flip('horizontal');
  if (state.geometry.flip.v) p.flip('vertical');

  // 2. Color
  const c = state.color;
  if (c.brightness !== 0) p.brightness(c.brightness);
  if (c.contrast !== 0) p.contrast(c.contrast);
  if (c.saturation !== 0) p.saturation(c.saturation);
  if (c.whiteBalance.temperature !== 0 || c.whiteBalance.tint !== 0) {
    p.whiteBalance(c.whiteBalance);
  }

  // 3. Detail
  if (state.detail.sharpen) p.unsharpMask(state.detail.sharpen);
  if (state.detail.blur) p.gaussianBlur(state.detail.blur);

  // 4. Watermark (face-blur deferred: see PR #8 / #10)
  if (state.watermark) p.watermark(state.watermark);

  // 5. Output: resize then encode
  if (state.output.resize) p.resize(state.output.resize);
  p.encode(
    mode === 'preview'
      ? { format: 'image/png', quality: 1 }
      : { format: state.output.format, quality: state.output.quality },
  );

  return p;
}
```

- [ ] **Step 8.4: Run test suite to verify pass**

```bash
pnpm --filter @pixflow/editor test 2>&1 | tail -10
```

Expected: all tests pass (~24 total: 2 defaults + 5 remap + 6 presets + ~18 state-to-pipeline including geometry/color/detail/watermark/output/return subdescribes).

- [ ] **Step 8.5: Verify typecheck**

```bash
pnpm --filter @pixflow/editor typecheck 2>&1 | tail -3
```

Expected: clean pass.

- [ ] **Step 8.6: Commit**

```bash
git add packages/editor/src/render/state-to-pipeline.ts packages/editor/test/state-to-pipeline.test.ts
git commit -m "feat(editor): add stateToPipeline adapter + comprehensive tests (PR #3 part 5/5)"
```

---

## Task 9: Full-workspace verification

**Files:** none (verification)

- [ ] **Step 9.1: Recursive test**

```bash
pnpm -r test 2>&1 | tail -15
```

Expected: pixflow 130/130 tests pass; editor ~24 tests pass; editor-ml skeleton prints "skipping"; examples/vanilla-js has no tests and skips or passes.

- [ ] **Step 9.2: Recursive typecheck**

```bash
pnpm -r typecheck 2>&1 | tail -15
```

Expected: pixflow clean; editor clean; editor-ml skeleton "skipping"; vanilla-js shows the SAME pre-existing errors as before PR #3 (requestAdapterInfo, compare possibly null). No NEW errors.

- [ ] **Step 9.3: Editor build still works**

```bash
pnpm --filter @pixflow/editor build 2>&1 | tail -8
```

Expected: Vite builds without error. JS bundle size grows slightly (added state + render source) but CSS is unchanged.

- [ ] **Step 9.4: Editor dev server still boots**

```bash
pkill -f "vite" 2>/dev/null; sleep 1
pnpm --filter @pixflow/editor dev > /tmp/editor-dev.log 2>&1 &
sleep 4
curl -sS http://localhost:5175/ -o /dev/null -w "Editor HTTP %{http_code}\n"
pkill -f "vite" 2>/dev/null
```

Expected: `Editor HTTP 200`. No regression in the boot shell from PR #2 — this PR only adds new files, doesn't touch App.tsx or main.tsx.

---

## Task 10: Merge to main

**Files:** none (git operations)

- [ ] **Step 10.1: Review feature-branch history**

```bash
git log --oneline main..HEAD
```

Expected: five feature commits (one per PR #3 part) since branching from main.

- [ ] **Step 10.2: Switch to main + merge with --no-ff**

```bash
git checkout main
git merge feature/pr03-state-to-pipeline --no-ff -m "$(cat <<'EOF'
Merge 'feature/pr03-state-to-pipeline' (PR #3)

Add the editor's EditState data model and the stateToPipeline adapter —
the pure, synchronous function that translates an EditState snapshot
into a configured pixflow Pipeline. Covers geometry, color, detail,
watermark, and output (resize + encode), including preview-vs-export
mode semantics. Face-blur wiring deferred to PR #10 (depends on PR #8
pixelate/regionBlur filters).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 10.3: Delete feature branch + verify**

```bash
git branch -d feature/pr03-state-to-pipeline
git log --oneline -6
```

Expected: merge commit at top, followed by the five feature commits, then the PR #2 merge.

---

## Self-review checklist

- [ ] `pnpm --filter @pixflow/editor test` runs vitest and passes all tests (no more "skipping" message)
- [ ] `pnpm --filter @pixflow/editor typecheck` passes under strict TS (including `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`)
- [ ] `pnpm --filter pixflow test` still shows 130/130 passing (pixflow untouched)
- [ ] `pnpm --filter @pixflow/editor build` still produces a valid production bundle
- [ ] `pnpm --filter @pixflow/editor dev` still serves the boot shell at :5175
- [ ] The adapter signature matches `stateToPipeline(state, mode, factory?)` exactly — factory-injection is there for tests
- [ ] No faceBlur branch in the adapter (documented with comment referencing PR #10)
- [ ] No pixflow internal imports leaked into the editor — only public API via `'pixflow'`
- [ ] All new files have a brief doc comment explaining their responsibility

---

## What PR #3 explicitly does NOT include

- Zustand store / state provider context — PR #4
- History (past/present/future) + undo/redo — PR #4
- Face-blur branch in stateToPipeline (pixelate / regionBlur) — PR #10 (needs PR #8 to land pixflow filters first)
- Preview engine / canvas rendering — PR #5
- Export engine / metadata stripping / audit report — PR #11, #12
- React components (inspector sections, canvas viewport) — PR #5, #6, #7
- Any integration test that actually calls `Pipeline.run()` — needs a real GPU (browser E2E tests in PR #15)
- Fixing pre-existing TS errors in `examples/vanilla-js/main.ts` — unrelated, separate PR

---

## Known risks and mitigations

- **Risk:** Mock pipeline tests don't exercise the actual `Pipeline.create()`. If pixflow changes its method signatures, adapter tests stay green but the real integration silently breaks.
  **Mitigation:** `import { Pipeline } from 'pixflow'` at the top of `state-to-pipeline.ts` triggers the TypeScript compiler to check our calls against pixflow's actual types. Any renamed/removed method surfaces at build or typecheck. Mock calls are checked against the typed parameter signatures by TypeScript at test-file compile time as well.

- **Risk:** `makeState()` test helper drift from `freshState()` — test state shape diverges from production.
  **Mitigation:** `makeState` is the test-side fixture; `freshState` is tested directly by `defaults.test.ts`. If spec-driven shape changes (e.g. new optional field), both will need to be updated and the matching tests will fail until they are.

- **Risk:** `exactOptionalPropertyTypes: true` makes `ResizeSpec` (with optional `maxWidth` / `maxHeight`) fussy — `{ maxWidth: 1200, fit: 'inside' }` might error if omitting `maxHeight` is interpreted as "explicit undefined".
  **Mitigation:** Optional fields declared with `?` (e.g. `readonly maxWidth?: number`) correctly allow omission. If TypeScript complains at any call site (e.g. in `presets.ts`), the fix is to omit the property entirely rather than set it to `undefined`. Task 7's preset implementations already follow this pattern.

- **Risk:** `PresetName` type imported from pixflow could expand in the future (new preset added in pixflow but not in editor's `applyPreset`).
  **Mitigation:** The `switch` is exhaustive. If pixflow adds a preset, TypeScript's exhaustiveness check on the switch fires (`noFallthroughCasesInSwitch` + no default branch) and the editor's build breaks — forcing us to handle it. That's the desired behavior.
