# PR #5 — Canvas viewport + zoom/pan + before/after overlay

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dev scaffolding in `App.tsx` with a real interactive canvas viewport that previews the current `EditState`, supports zoom/pan, and offers a before/after compare slider.

**Architecture:** Lazy `EditorContext` owns one `GPUDevice` for the session and is exposed via React context. A `PreviewEngine` translates each new `EditState` into a `pixflow.Pipeline` (via the existing `stateToPipeline` adapter, with a factory that injects the shared device), runs it against a downscaled "preview bitmap", and uses the `RunOptions.canvas` side-effect to render straight to the on-screen `<canvas>`. Cancel-and-restart via `AbortController`: stale renders are dropped if a newer state arrives. Viewport transform (`scale`, `offsetX`, `offsetY`) lives in a small pure reducer module, driven by pointer / wheel / keyboard hooks, and applied as a CSS `transform` on the canvas wrapper. Compare overlay is a second `<canvas>` (the original preview bitmap painted once) with the edited canvas on top, clipped via CSS `clip-path` driven by a slider position.

**Tech stack:**
- pixflow `Pipeline.create({ device })`, `Pipeline#run(source, { canvas })` — already shipped
- `stateToPipeline(state, mode, factory)` from PR #3
- React 19 contexts + hooks
- Vitest (node env, no GPU/DOM) for pure modules
- Existing zustand store from PR #4 for `EditState` subscription

**Critical pixflow API facts** (verified against `packages/pixflow/src/pipeline/pipeline.ts`):
- `Pipeline.create(opts)` is sync; `opts.device?` lets us share a `GPUDevice` across pipelines.
- `Pipeline#run(source, { canvas })` — passing a `canvas` makes `textureToBlob` use it as the 2D scratch surface (`putImageData`), rendering to screen as a side-effect. The returned blob is the same content, encoded; for preview mode we discard it.
- `RunOptions` does **not** include `signal`. Only `BatchOptions` does. Cancellation in single-shot run is an outer concern: we guard with our own `AbortController` and ignore the result on abort.
- `Pipeline#dispose()` only destroys *owned* devices (not externally-injected ones), so `EditorContext.dispose()` must call `device.destroy()` itself.

**What this PR does NOT do** (deferred to later PRs):
- Inspector controls (PR #6+) — viewport will only render existing state from store presets / undo / redo for this PR.
- Crop tool / face boxes overlay (PR #7 / #10).
- Real export pipeline / metadata strip (PR #11).
- Tailwind `prose` / Radix primitives in the bottom bar (PR #6 introduces Radix).

---

## File structure

**New files:**
- `packages/editor/src/context/editor-context.ts` — Lazy `GPUDevice` owner; sync façade with async `ensure()`.
- `packages/editor/src/context/EditorContextProvider.tsx` — React context + provider mounting one EditorContext per app.
- `packages/editor/src/preview/preview-bitmap.ts` — Pure helper computing target preview size + downscaling via `createImageBitmap`.
- `packages/editor/src/preview/preview-engine.ts` — `PreviewEngine` class with `requestRender(state)`, cancel-and-restart, factory-injected Pipeline.
- `packages/editor/src/viewport/viewport-state.ts` — Pure types + reducers for `{ scale, offsetX, offsetY }` transforms (zoom around point, pan, fit-to-container).
- `packages/editor/src/viewport/use-viewport.ts` — React hook bundling pointer / wheel / keyboard handlers + transform state.
- `packages/editor/src/viewport/use-preview-render.ts` — Hook that subscribes the store and drives a `PreviewEngine` instance for the lifetime of one document.
- `packages/editor/src/components/CanvasViewport.tsx` — Layout: edited canvas (top) + original canvas (bottom for compare) + transform wrapper.
- `packages/editor/src/components/CompareSlider.tsx` — Vertical-line drag handle + clip-path driver, toggled by `/` shortcut.
- `packages/editor/src/components/ZoomControls.tsx` — Bottom-bar zoom UI (− label + 100%/fit + plus + reset).
- `packages/editor/test/preview-bitmap.test.ts` — Unit tests for size math.
- `packages/editor/test/preview-engine.test.ts` — Unit tests for cancel-and-restart logic.
- `packages/editor/test/viewport-state.test.ts` — Unit tests for transform reducers.

**Modified files:**
- `packages/editor/src/App.tsx` — Wrap tree in `EditorContextProvider`, render `CanvasViewport` + `DevStatePanel` when `document` is non-null, keep `DropZone` empty-state.
- `packages/editor/test/test-helpers.ts` — Already covers `MockPipeline` + `makeState`; we add a `makeBitmap()` helper that returns a sentinel cast to `ImageBitmap` for engine tests.

**Files left intentionally untouched:** `DevStatePanel.tsx` already returns `null` when `document` is null (PR #4) and exposes preset buttons + JSON peek, which are exactly what we want during PR #5 smoke-testing. PR #6 replaces it with the real inspector.

---

## Task 1 — EditorContext (lazy GPU device singleton)

**Why first:** every render path needs the device; the rest of the PR depends on it. Built in isolation so it has no UI dependencies.

**Files:**
- Create: `packages/editor/src/context/editor-context.ts`
- Create: `packages/editor/src/context/EditorContextProvider.tsx`

- [ ] **Step 1.1 — Write the failing test for `EditorContext.create` semantics**

This is GPU-touching code so we cannot fully unit-test the device acquisition (vitest node env has no `navigator.gpu`). What we *can* test is the contract: `create()` returns a Promise, `dispose()` is idempotent, and a second concurrent `create()` while the first is in flight returns the same device. We do this by injecting an acquirer.

Create `packages/editor/test/editor-context.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createEditorContext } from '../src/context/editor-context';

const fakeDevice = { destroy: vi.fn() } as unknown as GPUDevice;

describe('createEditorContext', () => {
  it('acquires a device exactly once even when called concurrently', async () => {
    const acquire = vi.fn(async () => ({ device: fakeDevice, adapter: {} as GPUAdapter }));
    const ctx = createEditorContext({ acquire });
    const [a, b] = await Promise.all([ctx.ensure(), ctx.ensure()]);
    expect(acquire).toHaveBeenCalledTimes(1);
    expect(a.device).toBe(fakeDevice);
    expect(b.device).toBe(fakeDevice);
  });

  it('after dispose, ensure() rejects', async () => {
    const acquire = vi.fn(async () => ({ device: fakeDevice, adapter: {} as GPUAdapter }));
    const ctx = createEditorContext({ acquire });
    await ctx.ensure();
    ctx.dispose();
    await expect(ctx.ensure()).rejects.toThrow(/disposed/);
  });

  it('dispose() destroys the device exactly once', async () => {
    const destroy = vi.fn();
    const dev = { destroy } as unknown as GPUDevice;
    const acquire = vi.fn(async () => ({ device: dev, adapter: {} as GPUAdapter }));
    const ctx = createEditorContext({ acquire });
    await ctx.ensure();
    ctx.dispose();
    ctx.dispose();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('dispose() before ensure() resolves still destroys the device when it arrives', async () => {
    const destroy = vi.fn();
    const dev = { destroy } as unknown as GPUDevice;
    let release: () => void = () => {};
    const acquire = vi.fn(
      () => new Promise<{ device: GPUDevice; adapter: GPUAdapter }>((res) => {
        release = () => res({ device: dev, adapter: {} as GPUAdapter });
      }),
    );
    const ctx = createEditorContext({ acquire });
    const pending = ctx.ensure();
    ctx.dispose();
    release();
    await expect(pending).rejects.toThrow(/disposed/);
    // Even though dispose ran before the device arrived, late-arriving device must still be destroyed.
    await new Promise((r) => setTimeout(r, 0));
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 1.2 — Run the test and verify it fails**

Run from repo root:
```bash
pnpm --filter @pixflow/editor test --run editor-context
```
Expected: `Cannot find module '../src/context/editor-context'` or similar.

- [ ] **Step 1.3 — Implement `editor-context.ts`**

Create `packages/editor/src/context/editor-context.ts`:

```typescript
import { acquireDevice, type AcquiredDevice } from 'pixflow';

export interface EditorContext {
  /**
   * Resolve (or wait for) the shared GPUDevice. Lazily acquires on first
   * call; concurrent callers receive the same device. Rejects with a
   * "disposed" error if `dispose()` ran before/during acquisition.
   */
  ensure(): Promise<{ device: GPUDevice }>;
  /** Synchronous accessor; returns null until `ensure()` has resolved. */
  current(): { device: GPUDevice } | null;
  /** Destroy the device (if acquired) and reject any pending ensure() callers. */
  dispose(): void;
}

interface CreateOptions {
  /** Injectable for tests; defaults to pixflow's acquireDevice. */
  acquire?: () => Promise<AcquiredDevice>;
}

/**
 * One per session. Owns the GPUDevice that all preview/export pipelines
 * share via Pipeline.create({ device }). Pixflow's TexturePool and
 * PipelineCache are per-Pipeline instances (the public API doesn't allow
 * us to inject them), so EditorContext intentionally holds *only* the
 * device. Sharing the device is what avoids the cross-device validation
 * errors that bit us in the PR #1 batch bug.
 */
export function createEditorContext(opts: CreateOptions = {}): EditorContext {
  const acquire = opts.acquire ?? acquireDevice;
  let acquisition: Promise<{ device: GPUDevice }> | null = null;
  let device: GPUDevice | null = null;
  let disposed = false;

  return {
    ensure() {
      if (disposed) return Promise.reject(new Error('EditorContext disposed'));
      if (!acquisition) {
        acquisition = acquire().then((acq) => {
          if (disposed) {
            // dispose() ran while we were waiting; still need to destroy
            // the late-arriving device so we don't leak GPU resources.
            acq.device.destroy();
            throw new Error('EditorContext disposed');
          }
          device = acq.device;
          return { device: acq.device };
        });
      }
      return acquisition;
    },
    current() {
      return device ? { device } : null;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (device) {
        device.destroy();
        device = null;
      }
      // pending acquisition() callers will reject when their `if (disposed)` check fires above
    },
  };
}
```

- [ ] **Step 1.4 — Run the test and verify it passes**

```bash
pnpm --filter @pixflow/editor test --run editor-context
```
Expected: `4 passed`.

- [ ] **Step 1.5 — Implement `EditorContextProvider.tsx`**

Create `packages/editor/src/context/EditorContextProvider.tsx`:

```typescript
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { createEditorContext, type EditorContext } from './editor-context';

const Ctx = createContext<EditorContext | null>(null);

/**
 * Mounts a single EditorContext for the editor app's lifetime. Calls
 * dispose() on unmount (useful in tests; in production the only unmount
 * is page navigation, where browser cleanup also runs). React 19 strict
 * mode double-mounts effects in dev — the dispose path is idempotent
 * by design, so the second mount cleanly creates a fresh context.
 */
export function EditorContextProvider({ children }: { children: ReactNode }) {
  const ctx = useMemo(() => createEditorContext(), []);
  useEffect(() => () => ctx.dispose(), [ctx]);
  return <Ctx.Provider value={ctx}>{children}</Ctx.Provider>;
}

export function useEditorContext(): EditorContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useEditorContext must be called inside <EditorContextProvider>');
  return ctx;
}
```

- [ ] **Step 1.6 — Type-check the editor package**

```bash
pnpm --filter @pixflow/editor exec tsc --noEmit
```
Expected: 0 errors. (If `pixflow`'s `AcquiredDevice` type isn't exported, fall back to inline `{ device: GPUDevice; adapter: GPUAdapter }` — it is exported per `packages/pixflow/src/index.ts:18-21`.)

- [ ] **Step 1.7 — Commit**

```bash
git add packages/editor/src/context/ packages/editor/test/editor-context.test.ts
git commit -m "feat(editor): EditorContext owns shared GPUDevice via lazy acquire"
```

---

## Task 2 — Preview-bitmap helper (pure size math + downscale)

**Why:** the preview pipeline runs against a *downscaled* source — running 4032×3024 through every slider tick would stall the GPU. The math is pure, so we test it; the actual `createImageBitmap` call lives in a thin wrapper.

**Files:**
- Create: `packages/editor/src/preview/preview-bitmap.ts`
- Create: `packages/editor/test/preview-bitmap.test.ts`

- [ ] **Step 2.1 — Write the failing test**

Create `packages/editor/test/preview-bitmap.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  computePreviewSize,
  PREVIEW_MIN,
  PREVIEW_MAX,
} from '../src/preview/preview-bitmap';

describe('computePreviewSize', () => {
  it('returns natural size when smaller than the minimum target', () => {
    // tiny 200x150 source, container says 800 — natural is smallest, return as-is
    const out = computePreviewSize({
      naturalWidth: 200,
      naturalHeight: 150,
      containerWidth: 800,
      devicePixelRatio: 1,
    });
    expect(out).toEqual({ width: 200, height: 150 });
  });

  it('clamps to PREVIEW_MAX on the longest edge while preserving aspect ratio', () => {
    // 8000x4000 source, container 4000 × DPR 1 = 4000 → clamped to PREVIEW_MAX
    const out = computePreviewSize({
      naturalWidth: 8000,
      naturalHeight: 4000,
      containerWidth: 4000,
      devicePixelRatio: 1,
    });
    expect(out.width).toBe(PREVIEW_MAX);
    expect(out.height).toBe(Math.round(PREVIEW_MAX / 2));
  });

  it('clamps to PREVIEW_MIN when container * DPR is too small', () => {
    // 4000x3000 source, container 200 × DPR 1 = 200 → bumped up to PREVIEW_MIN
    const out = computePreviewSize({
      naturalWidth: 4000,
      naturalHeight: 3000,
      containerWidth: 200,
      devicePixelRatio: 1,
    });
    // longest edge = PREVIEW_MIN, height scaled down proportionally
    expect(out.width).toBe(PREVIEW_MIN);
    expect(out.height).toBe(Math.round((PREVIEW_MIN / 4000) * 3000));
  });

  it('factors devicePixelRatio into the target', () => {
    // 4000x3000 source, container 600 × DPR 2 = 1200 (between MIN and MAX)
    const out = computePreviewSize({
      naturalWidth: 4000,
      naturalHeight: 3000,
      containerWidth: 600,
      devicePixelRatio: 2,
    });
    expect(out.width).toBe(1200);
    expect(out.height).toBe(900);
  });

  it('handles portrait sources by clamping the longest edge (height)', () => {
    // 3000x6000 portrait source, container width 1000 → height drives the clamp
    const out = computePreviewSize({
      naturalWidth: 3000,
      naturalHeight: 6000,
      containerWidth: 1000,
      devicePixelRatio: 1,
    });
    // target longest-edge = 1000, height-driven so width = 500
    expect(out.height).toBe(1000);
    expect(out.width).toBe(500);
  });
});
```

- [ ] **Step 2.2 — Run test and verify it fails**

```bash
pnpm --filter @pixflow/editor test --run preview-bitmap
```
Expected: `Cannot find module '../src/preview/preview-bitmap'`.

- [ ] **Step 2.3 — Implement `preview-bitmap.ts`**

Create `packages/editor/src/preview/preview-bitmap.ts`:

```typescript
/**
 * Bounds for the preview render target. The lower bound keeps tiny
 * windows from rendering pixelated previews; the upper bound caps GPU
 * cost so a 4K monitor doesn't drag interactive feel below 60fps.
 *
 * Spec Section 3 calls out "containerWidth × devicePixelRatio, clamped
 * to [512, 2048]" — these constants own that contract.
 */
export const PREVIEW_MIN = 512;
export const PREVIEW_MAX = 2048;

export interface PreviewSize {
  readonly width: number;
  readonly height: number;
}

interface ComputeArgs {
  readonly naturalWidth: number;
  readonly naturalHeight: number;
  readonly containerWidth: number;
  readonly devicePixelRatio: number;
}

/**
 * Compute the preview bitmap's pixel dimensions: the longest edge of the
 * source image is scaled to `clamp(containerWidth × DPR, MIN, MAX)`, but
 * never above the source's natural size (no upscaling — that would just
 * waste GPU memory). Returned width/height preserve the source aspect.
 */
export function computePreviewSize(args: ComputeArgs): PreviewSize {
  const { naturalWidth, naturalHeight, containerWidth, devicePixelRatio } = args;
  const naturalLongest = Math.max(naturalWidth, naturalHeight);
  const desiredLongest = clamp(
    Math.round(containerWidth * devicePixelRatio),
    PREVIEW_MIN,
    PREVIEW_MAX,
  );
  const targetLongest = Math.min(desiredLongest, naturalLongest);
  const scale = targetLongest / naturalLongest;
  return {
    width: Math.round(naturalWidth * scale),
    height: Math.round(naturalHeight * scale),
  };
}

/**
 * Decode a downscaled preview bitmap from the source, sized according to
 * `computePreviewSize`. Wraps `createImageBitmap` so the engine has one
 * call site for "give me the preview bitmap for this state". Live behind
 * an async function so it stays out of the synchronous pure module above.
 */
export async function createPreviewBitmap(
  source: ImageBitmap,
  args: ComputeArgs,
): Promise<ImageBitmap> {
  const size = computePreviewSize(args);
  if (size.width === source.width && size.height === source.height) {
    return source;
  }
  return createImageBitmap(source, {
    resizeWidth: size.width,
    resizeHeight: size.height,
    resizeQuality: 'high',
  });
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
```

- [ ] **Step 2.4 — Run test and verify it passes**

```bash
pnpm --filter @pixflow/editor test --run preview-bitmap
```
Expected: `5 passed`.

- [ ] **Step 2.5 — Commit**

```bash
git add packages/editor/src/preview/preview-bitmap.ts packages/editor/test/preview-bitmap.test.ts
git commit -m "feat(editor): preview bitmap size math + downscale helper"
```

---

## Task 3 — PreviewEngine (cancel-and-restart render loop)

**Why:** isolates the "state changed → render frame" logic from React rendering. Tested with mock Pipelines so we don't need GPU.

**Files:**
- Create: `packages/editor/src/preview/preview-engine.ts`
- Create: `packages/editor/test/preview-engine.test.ts`
- Modify: `packages/editor/test/test-helpers.ts` — add `makeBitmap()` helper

- [ ] **Step 3.1 — Add `makeBitmap()` helper to test-helpers**

Edit `packages/editor/test/test-helpers.ts`. Find the `// Cast helper.` block at the bottom and append (after the existing `asPipelineFactory`):

```typescript
/**
 * Sentinel ImageBitmap-shaped object for engine tests. The PreviewEngine
 * never reads bitmap pixels — it only forwards the reference to
 * pipeline.run() — so an empty object cast to ImageBitmap is safe.
 */
export function makeBitmap(label: string): ImageBitmap {
  return { __label: label } as unknown as ImageBitmap;
}
```

- [ ] **Step 3.2 — Write the failing test**

Create `packages/editor/test/preview-engine.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PreviewEngine } from '../src/preview/preview-engine';
import { makeState, makeBitmap, createMockPipeline, type MockPipeline } from './test-helpers';

let mockPipeline: MockPipeline;
let runCalls: { signal: AbortSignal | undefined }[];

beforeEach(() => {
  vi.useFakeTimers();
  mockPipeline = createMockPipeline();
  runCalls = [];
  // Add `run` to the mock since stateToPipeline's MockPipeline doesn't include it.
  // Each run() resolves on the next microtask; tests advance fake timers to flush.
  (mockPipeline as unknown as { run: ReturnType<typeof vi.fn> }).run = vi.fn(
    async (_src: ImageBitmap, opts: { signal?: AbortSignal } = {}) => {
      runCalls.push({ signal: opts.signal });
      await new Promise((r) => setTimeout(r, 10));
      return { blob: new Blob(), width: 100, height: 100, stats: {} };
    },
  );
});

afterEach(() => {
  vi.useRealTimers();
});

const fakeDevice = {} as unknown as GPUDevice;
const fakeCanvas = {} as unknown as HTMLCanvasElement;

describe('PreviewEngine.requestRender', () => {
  it('runs the pipeline once for the initial state', async () => {
    const engine = new PreviewEngine({
      canvas: fakeCanvas,
      previewBitmap: makeBitmap('preview'),
      device: fakeDevice,
      pipelineFactory: () => mockPipeline as unknown as import('pixflow').Pipeline,
    });
    engine.requestRender(makeState());
    await vi.advanceTimersByTimeAsync(20);
    expect(runCalls).toHaveLength(1);
  });

  it('short-circuits when the same state reference is passed twice', async () => {
    const engine = new PreviewEngine({
      canvas: fakeCanvas,
      previewBitmap: makeBitmap('preview'),
      device: fakeDevice,
      pipelineFactory: () => mockPipeline as unknown as import('pixflow').Pipeline,
    });
    const s = makeState();
    engine.requestRender(s);
    engine.requestRender(s); // identical reference, should not enqueue
    await vi.advanceTimersByTimeAsync(20);
    expect(runCalls).toHaveLength(1);
  });

  it('cancels an in-flight render when a newer state arrives', async () => {
    const engine = new PreviewEngine({
      canvas: fakeCanvas,
      previewBitmap: makeBitmap('preview'),
      device: fakeDevice,
      pipelineFactory: () => mockPipeline as unknown as import('pixflow').Pipeline,
    });
    const s1 = makeState({ color: { brightness: 0.1, contrast: 0, saturation: 0, whiteBalance: { temperature: 0, tint: 0 } } });
    const s2 = makeState({ color: { brightness: 0.2, contrast: 0, saturation: 0, whiteBalance: { temperature: 0, tint: 0 } } });
    engine.requestRender(s1);
    engine.requestRender(s2);
    await vi.advanceTimersByTimeAsync(50);
    // Both runs may have fired (no abort signal in pixflow's RunOptions),
    // but the FIRST run's abort signal must show .aborted=true so the engine
    // ignores its result.
    expect(runCalls.length).toBeGreaterThanOrEqual(1);
    expect(runCalls[0]?.signal?.aborted).toBe(true);
    // Latest signal must NOT be aborted
    expect(runCalls[runCalls.length - 1]?.signal?.aborted).toBe(false);
  });

  it('dispose() aborts any in-flight render and ignores subsequent requests', async () => {
    const engine = new PreviewEngine({
      canvas: fakeCanvas,
      previewBitmap: makeBitmap('preview'),
      device: fakeDevice,
      pipelineFactory: () => mockPipeline as unknown as import('pixflow').Pipeline,
    });
    engine.requestRender(makeState());
    engine.dispose();
    await vi.advanceTimersByTimeAsync(20);
    // After dispose, any further request must be a no-op
    engine.requestRender(makeState({ color: { brightness: 0.5, contrast: 0, saturation: 0, whiteBalance: { temperature: 0, tint: 0 } } }));
    await vi.advanceTimersByTimeAsync(20);
    // First run was issued before dispose, so runCalls[0] exists; its signal must be aborted.
    expect(runCalls[0]?.signal?.aborted).toBe(true);
    // No new run after dispose
    expect(runCalls).toHaveLength(1);
  });
});
```

- [ ] **Step 3.3 — Run test and verify it fails**

```bash
pnpm --filter @pixflow/editor test --run preview-engine
```
Expected: `Cannot find module '../src/preview/preview-engine'`.

- [ ] **Step 3.4 — Implement `preview-engine.ts`**

Create `packages/editor/src/preview/preview-engine.ts`:

```typescript
import { Pipeline } from 'pixflow';
import { stateToPipeline } from '../render/state-to-pipeline';
import type { EditState } from '../state/types';

interface EngineOptions {
  readonly canvas: HTMLCanvasElement;
  readonly previewBitmap: ImageBitmap;
  readonly device: GPUDevice;
  /**
   * Factory used by stateToPipeline. Defaults to constructing a real
   * pixflow Pipeline that shares the editor's GPUDevice. Tests inject
   * a mock factory so they don't need a real GPU.
   */
  readonly pipelineFactory?: () => Pipeline;
}

/**
 * Drives the preview canvas. Each time `requestRender(state)` is called
 * with a new state reference, the engine schedules a render via
 * requestAnimationFrame. If a *newer* state arrives while one render is
 * in flight, the older render's AbortController is signalled and its
 * result is ignored. (Pixflow's single-shot run() doesn't honour an
 * abort signal mid-pipeline, so we cannot interrupt the GPU work — but
 * we *do* short-circuit before the destination canvas would otherwise
 * receive stale pixels.)
 *
 * The engine writes preview output by passing `canvas` to RunOptions:
 * pixflow's textureToBlob uses the supplied canvas as the readback 2D
 * scratch buffer (putImageData), so the canvas updates as a side
 * effect. We discard the returned blob — preview never leaves the page.
 */
export class PreviewEngine {
  private lastState: EditState | null = null;
  private currentAbort: AbortController | null = null;
  private rafHandle: number | null = null;
  private disposed = false;
  private readonly factory: () => Pipeline;

  constructor(private readonly opts: EngineOptions) {
    this.factory = opts.pipelineFactory ?? (() => Pipeline.create({ device: opts.device }));
  }

  requestRender(state: EditState): void {
    if (this.disposed) return;
    if (state === this.lastState) return; // cheap referential short-circuit
    this.lastState = state;

    // Cancel the previous render's "ignore the result if newer state arrived" guard.
    this.currentAbort?.abort();
    const abort = new AbortController();
    this.currentAbort = abort;

    if (this.rafHandle !== null) cancelAnimationFrame(this.rafHandle);
    this.rafHandle = requestAnimationFrame(() => {
      this.rafHandle = null;
      void this.renderFrame(state, abort.signal);
    });
  }

  private async renderFrame(state: EditState, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return;
    const pipeline = stateToPipeline(state, 'preview', this.factory);
    try {
      // We pass `canvas` so pixflow's readback path writes into our
      // on-screen canvas as a side effect; the returned blob is discarded.
      // We also forward the signal even though pixflow's RunOptions
      // doesn't honour it — tests assert on it, and forward-compat costs
      // nothing.
      await pipeline.run(this.opts.previewBitmap, {
        canvas: this.opts.canvas,
        signal,
      } as Parameters<Pipeline['run']>[1]);
      // If a newer state arrived during the run, the canvas already
      // received stale pixels but we'll repaint immediately on the next
      // animation frame — the AbortController guard prevents us from
      // *also* calling drawing helpers on top.
      if (signal.aborted) return;
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return;
      // Surface real errors. PR #6 will replace console with a toast surface.
      console.error('[PreviewEngine] render failed', err);
    } finally {
      pipeline.dispose();
    }
  }

  dispose(): void {
    this.disposed = true;
    this.currentAbort?.abort();
    this.currentAbort = null;
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
  }
}
```

Note: `requestAnimationFrame` and `cancelAnimationFrame` are global in vitest's `node` env when using `vi.useFakeTimers()` — vitest polyfills them via `setImmediate`/timer queues. The tests above use `vi.advanceTimersByTimeAsync` to flush the rAF callbacks.

- [ ] **Step 3.5 — Run test and verify it passes**

```bash
pnpm --filter @pixflow/editor test --run preview-engine
```
Expected: `4 passed`.

If `requestAnimationFrame is not defined` errors appear, polyfill at the top of the test file:
```typescript
beforeEach(() => {
  vi.useFakeTimers();
  // jsdom is not enabled, so polyfill rAF for the engine's scheduling
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
    setTimeout(() => cb(performance.now()), 16) as unknown as number);
  globalThis.cancelAnimationFrame = ((handle: number) => clearTimeout(handle as unknown as NodeJS.Timeout));
  // ...
});
```

- [ ] **Step 3.6 — Commit**

```bash
git add packages/editor/src/preview/preview-engine.ts packages/editor/test/preview-engine.test.ts packages/editor/test/test-helpers.ts
git commit -m "feat(editor): PreviewEngine with cancel-and-restart render loop"
```

---

## Task 4 — Viewport state (pure transform reducers)

**Why:** zoom/pan math should be deterministic and unit-tested. Hooks built on top stay thin.

**Files:**
- Create: `packages/editor/src/viewport/viewport-state.ts`
- Create: `packages/editor/test/viewport-state.test.ts`

- [ ] **Step 4.1 — Write the failing test**

Create `packages/editor/test/viewport-state.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  identityTransform,
  zoomAt,
  pan,
  fitToContainer,
  clampScale,
  ZOOM_MIN,
  ZOOM_MAX,
  type ViewportTransform,
} from '../src/viewport/viewport-state';

describe('clampScale', () => {
  it('returns ZOOM_MIN when scale is below the minimum', () => {
    expect(clampScale(ZOOM_MIN / 2)).toBe(ZOOM_MIN);
  });
  it('returns ZOOM_MAX when scale is above the maximum', () => {
    expect(clampScale(ZOOM_MAX * 2)).toBe(ZOOM_MAX);
  });
  it('passes through values inside the range', () => {
    expect(clampScale(1.5)).toBe(1.5);
  });
});

describe('zoomAt', () => {
  it('keeps the focal point fixed when scaling up', () => {
    // Start centered at scale 1; zoom in 2x at point (100, 50)
    const before: ViewportTransform = { scale: 1, offsetX: 0, offsetY: 0 };
    const after = zoomAt(before, 2, { x: 100, y: 50 });
    // The point (100, 50) in screen space should still map to the same
    // image-space point: imageX = (screenX - offsetX) / scale.
    const beforeImg = { x: (100 - before.offsetX) / before.scale, y: (50 - before.offsetY) / before.scale };
    const afterImg = { x: (100 - after.offsetX) / after.scale, y: (50 - after.offsetY) / after.scale };
    expect(afterImg.x).toBeCloseTo(beforeImg.x);
    expect(afterImg.y).toBeCloseTo(beforeImg.y);
    expect(after.scale).toBeCloseTo(2);
  });

  it('clamps the scale to ZOOM_MAX', () => {
    const before: ViewportTransform = { scale: 1, offsetX: 0, offsetY: 0 };
    const after = zoomAt(before, ZOOM_MAX * 10, { x: 0, y: 0 });
    expect(after.scale).toBe(ZOOM_MAX);
  });

  it('clamps the scale to ZOOM_MIN', () => {
    const before: ViewportTransform = { scale: 1, offsetX: 0, offsetY: 0 };
    const after = zoomAt(before, ZOOM_MIN / 10, { x: 0, y: 0 });
    expect(after.scale).toBe(ZOOM_MIN);
  });
});

describe('pan', () => {
  it('adds dx/dy to the current offset', () => {
    const before: ViewportTransform = { scale: 1.5, offsetX: 10, offsetY: 20 };
    const after = pan(before, 30, -5);
    expect(after).toEqual({ scale: 1.5, offsetX: 40, offsetY: 15 });
  });
});

describe('fitToContainer', () => {
  it('computes a scale + centered offset that fits the image inside the container', () => {
    // 4000x3000 image, 800x600 container → scale 0.2 (both dims fit), centered
    const out = fitToContainer({
      imageWidth: 4000,
      imageHeight: 3000,
      containerWidth: 800,
      containerHeight: 600,
    });
    expect(out.scale).toBeCloseTo(0.2);
    expect(out.offsetX).toBeCloseTo(0);
    expect(out.offsetY).toBeCloseTo(0);
  });

  it('letterboxes a portrait image into a landscape container', () => {
    // 600x1200 portrait, 800x600 container → height-driven scale 0.5
    // displayed image = 300x600, centered horizontally → offsetX = (800-300)/2 = 250
    const out = fitToContainer({
      imageWidth: 600,
      imageHeight: 1200,
      containerWidth: 800,
      containerHeight: 600,
    });
    expect(out.scale).toBeCloseTo(0.5);
    expect(out.offsetX).toBeCloseTo(250);
    expect(out.offsetY).toBeCloseTo(0);
  });
});

describe('identityTransform', () => {
  it('returns scale=1, offset=0', () => {
    expect(identityTransform()).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });
});
```

- [ ] **Step 4.2 — Run and verify failure**

```bash
pnpm --filter @pixflow/editor test --run viewport-state
```
Expected: module not found.

- [ ] **Step 4.3 — Implement `viewport-state.ts`**

Create `packages/editor/src/viewport/viewport-state.ts`:

```typescript
/**
 * Pure transform model for the canvas viewport. The image is laid out
 * inside the container with `transform: translate(offsetX, offsetY)
 * scale(scale)` applied to the canvas wrapper. Coordinates are in
 * container CSS pixels; `scale` is unitless (1 = 1 image-px per CSS-px).
 */
export interface ViewportTransform {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

/**
 * Zoom range. 1/8x lower bound is generous enough to view huge images
 * (8000+px) end-to-end without losing anchor points. 8x upper bound
 * matches photo-editor convention (Lightroom caps at 8:1, Photoshop
 * at 32:1 — 8 is a deliberate compromise: enough for pixel-peeping
 * face boxes, not so much that we wreck the GPU on a 10-megapixel preview).
 */
export const ZOOM_MIN = 0.125;
export const ZOOM_MAX = 8;

export function identityTransform(): ViewportTransform {
  return { scale: 1, offsetX: 0, offsetY: 0 };
}

export function clampScale(scale: number): number {
  if (scale < ZOOM_MIN) return ZOOM_MIN;
  if (scale > ZOOM_MAX) return ZOOM_MAX;
  return scale;
}

/**
 * Scale by `factor` while keeping the focal point fixed in screen space.
 * Standard "zoom around mouse" math: the image-space point under the
 * focal screen point must map to the same screen point after scaling.
 *
 *   imagePt = (screen - offset) / scale
 *   scale'  = scale × factor
 *   offset' = screen - imagePt × scale'
 */
export function zoomAt(
  t: ViewportTransform,
  factor: number,
  focal: { readonly x: number; readonly y: number },
): ViewportTransform {
  const targetScale = clampScale(t.scale * factor);
  if (targetScale === t.scale) return t;
  const imageX = (focal.x - t.offsetX) / t.scale;
  const imageY = (focal.y - t.offsetY) / t.scale;
  return {
    scale: targetScale,
    offsetX: focal.x - imageX * targetScale,
    offsetY: focal.y - imageY * targetScale,
  };
}

/** Translate by raw screen-space delta. */
export function pan(t: ViewportTransform, dx: number, dy: number): ViewportTransform {
  return { scale: t.scale, offsetX: t.offsetX + dx, offsetY: t.offsetY + dy };
}

interface FitArgs {
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly containerWidth: number;
  readonly containerHeight: number;
}

/**
 * Compute the transform that displays the entire image inside the
 * container with letterbox / pillarbox padding as needed. Result is
 * always centered.
 */
export function fitToContainer(args: FitArgs): ViewportTransform {
  const sx = args.containerWidth / args.imageWidth;
  const sy = args.containerHeight / args.imageHeight;
  const scale = clampScale(Math.min(sx, sy));
  const displayedW = args.imageWidth * scale;
  const displayedH = args.imageHeight * scale;
  return {
    scale,
    offsetX: (args.containerWidth - displayedW) / 2,
    offsetY: (args.containerHeight - displayedH) / 2,
  };
}
```

- [ ] **Step 4.4 — Run test and verify it passes**

```bash
pnpm --filter @pixflow/editor test --run viewport-state
```
Expected: `9 passed`.

- [ ] **Step 4.5 — Commit**

```bash
git add packages/editor/src/viewport/viewport-state.ts packages/editor/test/viewport-state.test.ts
git commit -m "feat(editor): viewport transform reducers (zoom/pan/fit)"
```

---

## Task 5 — `useViewport` hook (pointer / wheel / keyboard handlers)

**Why:** wires the pure reducers from Task 4 into React state and DOM events. No tests — this is glue.

**Files:**
- Create: `packages/editor/src/viewport/use-viewport.ts`

- [ ] **Step 5.1 — Implement `use-viewport.ts`**

Create `packages/editor/src/viewport/use-viewport.ts`:

```typescript
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
  type WheelEvent,
} from 'react';
import {
  fitToContainer,
  identityTransform,
  pan,
  zoomAt,
  type ViewportTransform,
} from './viewport-state';

interface UseViewportArgs {
  readonly containerRef: RefObject<HTMLDivElement | null>;
  readonly imageWidth: number;
  readonly imageHeight: number;
}

interface UseViewportResult {
  readonly transform: ViewportTransform;
  readonly onWheel: (e: WheelEvent<HTMLDivElement>) => void;
  readonly onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  readonly fit: () => void;
  readonly zoomBy: (factor: number) => void;
  readonly setZoom: (scale: number) => void;
  /** True while the user holds Space (Photoshop-style temporary pan). */
  readonly panMode: boolean;
}

/**
 * Manages viewport transform state + interaction handlers for the
 * canvas. Returns React-ready event handlers; the consumer attaches
 * them to the container <div>. On mount and whenever image dimensions
 * change, the transform is reset to "fit". The Space key toggles a
 * temporary pan mode (cursor becomes grab/grabbing); pinch / Ctrl-wheel
 * zooms around the cursor; wheel without modifiers pans.
 */
export function useViewport(args: UseViewportArgs): UseViewportResult {
  const { containerRef, imageWidth, imageHeight } = args;
  const [transform, setTransform] = useState<ViewportTransform>(identityTransform);
  const [panMode, setPanMode] = useState(false);
  const panRef = useRef(panMode);
  panRef.current = panMode;

  // Fit-to-container on mount and whenever image dims change.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setTransform(
      fitToContainer({
        imageWidth,
        imageHeight,
        containerWidth: el.clientWidth,
        containerHeight: el.clientHeight,
      }),
    );
  }, [containerRef, imageWidth, imageHeight]);

  // Space-key pan mode + `+`/`-` zoom shortcuts. Ignore when typing.
  useEffect(() => {
    function isTyping(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable;
    }
    function down(e: KeyboardEvent): void {
      if (isTyping(e.target)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setPanMode(true);
        return;
      }
      // `+` / `=` (same key on US layouts) zoom in around viewport center
      // `-` / `_` zoom out. Done here (not in CanvasViewport) so the
      // shortcut works whenever the viewport is mounted, regardless of
      // canvas focus.
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        const el = containerRef.current;
        if (!el) return;
        const cx = el.clientWidth / 2;
        const cy = el.clientHeight / 2;
        setTransform((t) => zoomAt(t, 1.25, { x: cx, y: cy }));
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        const el = containerRef.current;
        if (!el) return;
        const cx = el.clientWidth / 2;
        const cy = el.clientHeight / 2;
        setTransform((t) => zoomAt(t, 0.8, { x: cx, y: cy }));
      }
    }
    function up(e: KeyboardEvent): void {
      if (e.code === 'Space') setPanMode(false);
    }
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [containerRef]);

  const onWheel = useCallback(
    (e: WheelEvent<HTMLDivElement>) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const focal = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      // Ctrl/Cmd + wheel OR pinch (deltaMode === 0 with Ctrl synthesised by browsers): zoom
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.pow(1.0015, -e.deltaY); // smooth exponential
        setTransform((t) => zoomAt(t, factor, focal));
      } else {
        setTransform((t) => pan(t, -e.deltaX, -e.deltaY));
      }
    },
    [containerRef],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Pan only when Space is held (panMode) or middle mouse button is used.
      if (!panRef.current && e.button !== 1) return;
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const startTransform = transform;
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);
      function onMove(ev: PointerEvent): void {
        setTransform({
          scale: startTransform.scale,
          offsetX: startTransform.offsetX + (ev.clientX - startX),
          offsetY: startTransform.offsetY + (ev.clientY - startY),
        });
      }
      function onUp(ev: PointerEvent): void {
        target.releasePointerCapture(ev.pointerId);
        target.removeEventListener('pointermove', onMove);
        target.removeEventListener('pointerup', onUp);
      }
      target.addEventListener('pointermove', onMove);
      target.addEventListener('pointerup', onUp);
    },
    [transform],
  );

  const fit = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setTransform(
      fitToContainer({
        imageWidth,
        imageHeight,
        containerWidth: el.clientWidth,
        containerHeight: el.clientHeight,
      }),
    );
  }, [containerRef, imageWidth, imageHeight]);

  const zoomBy = useCallback((factor: number) => {
    const el = containerRef.current;
    if (!el) return;
    const cx = el.clientWidth / 2;
    const cy = el.clientHeight / 2;
    setTransform((t) => zoomAt(t, factor, { x: cx, y: cy }));
  }, [containerRef]);

  const setZoom = useCallback((targetScale: number) => {
    setTransform((t) => zoomAt(t, targetScale / t.scale, { x: 0, y: 0 }));
  }, []);

  return { transform, onWheel, onPointerDown, fit, zoomBy, setZoom, panMode };
}
```

- [ ] **Step 5.2 — Type-check the editor package**

```bash
pnpm --filter @pixflow/editor exec tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 5.3 — Commit**

```bash
git add packages/editor/src/viewport/use-viewport.ts
git commit -m "feat(editor): useViewport hook (pointer/wheel/keyboard for zoom+pan)"
```

---

## Task 6 — `usePreviewRender` hook

**Why:** ties the store, EditorContext, and PreviewEngine together. Owns the lifecycle: create engine when the document loads, dispose on unload, drive `requestRender` whenever `present` changes.

**Files:**
- Create: `packages/editor/src/viewport/use-preview-render.ts`

- [ ] **Step 6.1 — Implement `use-preview-render.ts`**

Create `packages/editor/src/viewport/use-preview-render.ts`:

```typescript
import { useEffect, useRef, useState } from 'react';
import { useEditStore } from '../state/store';
import { useEditorContext } from '../context/EditorContextProvider';
import { PreviewEngine } from '../preview/preview-engine';
import { createPreviewBitmap } from '../preview/preview-bitmap';
import type { EditState } from '../state/types';

interface UsePreviewRenderArgs {
  readonly canvas: HTMLCanvasElement | null;
  readonly containerWidth: number;
}

/**
 * Wires the EditStore's `present` state to the on-screen canvas.
 *
 * Lifecycle:
 *   - When (canvas, document.source) become available, async-decode a
 *     downscaled preview bitmap, ensure the GPUDevice, and instantiate
 *     a PreviewEngine. Subscribe to `present` so every state change
 *     calls engine.requestRender(state).
 *   - When source.bitmap changes (new image loaded) or canvas unmounts,
 *     dispose the previous engine + close the previous preview bitmap.
 *
 * Returns the original (un-edited) preview bitmap for the compare
 * overlay to paint into a separate canvas — saves a second decode.
 */
export function usePreviewRender(args: UsePreviewRenderArgs): {
  readonly previewBitmap: ImageBitmap | null;
  readonly ready: boolean;
} {
  const { canvas, containerWidth } = args;
  const editorCtx = useEditorContext();
  const source = useEditStore((s) => s.document?.present.source ?? null);
  const [previewBitmap, setPreviewBitmap] = useState<ImageBitmap | null>(null);
  const [ready, setReady] = useState(false);
  const engineRef = useRef<PreviewEngine | null>(null);

  // Build / rebuild engine whenever the source bitmap or canvas changes.
  useEffect(() => {
    if (!canvas || !source) {
      setPreviewBitmap(null);
      setReady(false);
      return;
    }
    let cancelled = false;
    let previousBitmap: ImageBitmap | null = null;

    (async () => {
      const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
      const preview = await createPreviewBitmap(source.bitmap, {
        naturalWidth: source.naturalWidth,
        naturalHeight: source.naturalHeight,
        containerWidth: Math.max(1, containerWidth),
        devicePixelRatio: dpr,
      });
      if (cancelled) {
        if (preview !== source.bitmap) preview.close();
        return;
      }
      const { device } = await editorCtx.ensure();
      if (cancelled) {
        if (preview !== source.bitmap) preview.close();
        return;
      }

      previousBitmap = preview;
      setPreviewBitmap(preview);
      const engine = new PreviewEngine({
        canvas,
        previewBitmap: preview,
        device,
      });
      engineRef.current = engine;

      // Initial render of the current state.
      const present = useEditStore.getState().document?.present;
      if (present) engine.requestRender(present);

      // Subscribe to present-changes. The selector returns a stable ref
      // so the listener only fires when the state object actually changes.
      const unsubscribe = useEditStore.subscribe((state, prev) => {
        const next = state.document?.present;
        const prevPresent = prev.document?.present;
        if (next && next !== prevPresent) engine.requestRender(next);
      });
      setReady(true);

      // Cleanup chained from this same effect closure.
      return () => {
        unsubscribe();
        engine.dispose();
        engineRef.current = null;
      };
    })().catch((err) => {
      if (!cancelled) console.error('[usePreviewRender] failed to set up preview', err);
    });

    return () => {
      cancelled = true;
      // Close previous preview bitmap unless it's the source bitmap (no-op decode case).
      if (previousBitmap && previousBitmap !== source.bitmap) {
        previousBitmap.close();
      }
      engineRef.current?.dispose();
      engineRef.current = null;
      setReady(false);
    };
  }, [canvas, source, containerWidth, editorCtx]);

  return { previewBitmap, ready };
}
```

- [ ] **Step 6.2 — Type-check the editor package**

```bash
pnpm --filter @pixflow/editor exec tsc --noEmit
```
Expected: 0 errors. (If `useEditStore.subscribe`'s second-arg signature differs in our zustand 5 install, switch to `useEditStore.subscribe((state) => state.document?.present, (next, prev) => { if (next && next !== prev) engine.requestRender(next); })`.)

- [ ] **Step 6.3 — Commit**

```bash
git add packages/editor/src/viewport/use-preview-render.ts
git commit -m "feat(editor): usePreviewRender wires store ↔ PreviewEngine ↔ canvas"
```

---

## Task 7 — `ZoomControls` component (bottom bar)

**Why first:** Task 9's `CanvasViewport` imports `ZoomControls`. Building leaf components first keeps every commit individually compilable (good for `git bisect`).

**Files:**
- Create: `packages/editor/src/components/ZoomControls.tsx`

- [ ] **Step 7.1 — Implement `ZoomControls.tsx`**

Create `packages/editor/src/components/ZoomControls.tsx`:

```typescript
import { ZOOM_MAX, ZOOM_MIN } from '../viewport/viewport-state';

interface ZoomControlsProps {
  readonly scale: number;
  readonly onZoomIn: () => void;
  readonly onZoomOut: () => void;
  readonly onFit: () => void;
  readonly onActualSize: () => void;
}

/**
 * Bottom-bar zoom UI. Disabled-state handling is deliberately verbose
 * for clarity (ZOOM_MIN / ZOOM_MAX guards). Tailwind classes follow
 * the existing PR #4 pill pattern (HistoryIndicator). PR #6 will wrap
 * the ⌥-key shortcuts into Radix tooltips; for now the bare buttons
 * live alongside the canvas.
 */
export function ZoomControls(props: ZoomControlsProps) {
  const pct = Math.round(props.scale * 100);
  const atMin = props.scale <= ZOOM_MIN + 1e-6;
  const atMax = props.scale >= ZOOM_MAX - 1e-6;

  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-2 py-1 font-[var(--font-mono)] text-xs">
      <button
        type="button"
        onClick={props.onZoomOut}
        disabled={atMin}
        aria-label="Zoom out"
        className="px-1.5 py-0.5 hover:text-[var(--color-accent)] disabled:opacity-40"
      >
        −
      </button>
      <span className="min-w-[3rem] text-center tabular-nums">{pct}%</span>
      <button
        type="button"
        onClick={props.onZoomIn}
        disabled={atMax}
        aria-label="Zoom in"
        className="px-1.5 py-0.5 hover:text-[var(--color-accent)] disabled:opacity-40"
      >
        +
      </button>
      <span className="text-[var(--color-muted)]">·</span>
      <button
        type="button"
        onClick={props.onFit}
        aria-label="Fit to viewport"
        className="px-1.5 py-0.5 hover:text-[var(--color-accent)]"
      >
        Fit
      </button>
      <button
        type="button"
        onClick={props.onActualSize}
        aria-label="Actual size (100%)"
        className="px-1.5 py-0.5 hover:text-[var(--color-accent)]"
      >
        1:1
      </button>
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
git add packages/editor/src/components/ZoomControls.tsx
git commit -m "feat(editor): ZoomControls bottom-bar component"
```

---

## Task 8 — `CompareSlider` component (clip-path drag handle)

**Why before CanvasViewport:** same reason as Task 7 — leaf component first.

**Files:**
- Create: `packages/editor/src/components/CompareSlider.tsx`

- [ ] **Step 8.1 — Implement `CompareSlider.tsx`**

Create `packages/editor/src/components/CompareSlider.tsx`:

```typescript
import { useCallback, useRef, type PointerEvent } from 'react';

interface CompareSliderProps {
  /** Current split position, 0 (all original) to 100 (all edited). */
  readonly value: number;
  readonly onChange: (next: number) => void;
}

/**
 * Vertical drag handle for the before/after compare overlay. The line
 * itself spans the container; the handle in the middle is a draggable
 * pill. Pointer events are captured so dragging outside the container
 * still updates the position. The visual is rendered absolutely inside
 * the canvas viewport — its parent must be `position: relative`.
 */
export function CompareSlider({ value, onChange }: CompareSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);
      const parent = target.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      function update(clientX: number): void {
        const pct = ((clientX - rect.left) / rect.width) * 100;
        onChange(Math.max(0, Math.min(100, pct)));
      }
      update(e.clientX);
      function onMove(ev: globalThis.PointerEvent): void {
        update(ev.clientX);
      }
      function onUp(ev: globalThis.PointerEvent): void {
        target.releasePointerCapture(ev.pointerId);
        target.removeEventListener('pointermove', onMove);
        target.removeEventListener('pointerup', onUp);
      }
      target.addEventListener('pointermove', onMove);
      target.addEventListener('pointerup', onUp);
    },
    [onChange],
  );

  return (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      role="slider"
      aria-label="Before/after compare"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
      style={{ left: `${value.toString()}%` }}
      className="absolute top-0 bottom-0 z-10 -ml-px w-0.5 cursor-ew-resize bg-[var(--color-accent)]"
    >
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--color-accent)] bg-[var(--color-bg)] px-2 py-1 font-[var(--font-mono)] text-[10px] text-[var(--color-accent)] shadow-sm">
        ⇆
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
git add packages/editor/src/components/CompareSlider.tsx
git commit -m "feat(editor): CompareSlider with clip-path drag handle"
```

---

## Task 9 — `CanvasViewport` component

**Why:** the visible surface. Combines: container <div> sized to viewport, transform wrapper, edited canvas (top), original "compare" canvas (bottom layer), wires the hooks above. Now imports already-built `ZoomControls` and `CompareSlider`, so each commit on this branch type-checks.

**Files:**
- Create: `packages/editor/src/components/CanvasViewport.tsx`

- [ ] **Step 9.1 — Implement `CanvasViewport.tsx`**

Create `packages/editor/src/components/CanvasViewport.tsx`:

```typescript
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useEditStore } from '../state/store';
import { useViewport } from '../viewport/use-viewport';
import { usePreviewRender } from '../viewport/use-preview-render';
import { CompareSlider } from './CompareSlider';
import { ZoomControls } from './ZoomControls';

/**
 * The main canvas viewport. Hosts two stacked canvases:
 *   - `original` (bottom layer): the un-edited preview bitmap, painted
 *     once via 2D drawImage. Used by the compare slider.
 *   - `edited` (top layer): driven by PreviewEngine; pixflow renders
 *     pipeline output here as a side effect of textureToBlob.
 *
 * Both canvases live inside a transform wrapper that applies
 * `translate(offsetX, offsetY) scale(scale)` from the viewport hook.
 * The container measures itself via ResizeObserver so the preview
 * downscale target adjusts when the window resizes.
 */
export function CanvasViewport() {
  const containerRef = useRef<HTMLDivElement>(null);
  const editedRef = useRef<HTMLCanvasElement>(null);
  const originalRef = useRef<HTMLCanvasElement>(null);
  const document = useEditStore((s) => s.document);
  const source = document?.present.source ?? null;

  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // Track container size for the preview downscale target. layout effect
  // so the first measurement runs before paint.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { previewBitmap } = usePreviewRender({
    canvas: editedRef.current,
    containerWidth: containerSize.width,
  });

  const viewport = useViewport({
    containerRef,
    imageWidth: previewBitmap?.width ?? source?.naturalWidth ?? 1,
    imageHeight: previewBitmap?.height ?? source?.naturalHeight ?? 1,
  });

  // Paint the original canvas once whenever previewBitmap changes.
  useEffect(() => {
    const c = originalRef.current;
    if (!c || !previewBitmap) return;
    c.width = previewBitmap.width;
    c.height = previewBitmap.height;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(previewBitmap, 0, 0);
  }, [previewBitmap]);

  // Compare slider toggle (`/` key). Lives at the viewport level so the
  // canvas wrapper can render the clip-path through CSS.
  const [compare, setCompare] = useState(false);
  const [splitPct, setSplitPct] = useState(50);
  useEffect(() => {
    function isTyping(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable;
    }
    function down(e: KeyboardEvent): void {
      if (isTyping(e.target)) return;
      if (e.key === '/') {
        e.preventDefault();
        setCompare((v) => !v);
      }
    }
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, []);

  if (!document) {
    return null;
  }

  const { scale, offsetX, offsetY } = viewport.transform;

  return (
    <div className="flex flex-1 flex-col gap-2">
      <div
        ref={containerRef}
        onWheel={viewport.onWheel}
        onPointerDown={viewport.onPointerDown}
        className={`relative w-full flex-1 min-h-[60vh] overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] ${
          viewport.panMode ? 'cursor-grab' : 'cursor-default'
        }`}
        role="img"
        aria-label="Edit preview"
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            transformOrigin: '0 0',
            transform: `translate(${offsetX.toString()}px, ${offsetY.toString()}px) scale(${scale.toString()})`,
            width: previewBitmap?.width ?? 0,
            height: previewBitmap?.height ?? 0,
          }}
        >
          <canvas
            ref={originalRef}
            className="absolute inset-0 block"
            style={{ width: '100%', height: '100%' }}
          />
          <canvas
            ref={editedRef}
            className="absolute inset-0 block"
            style={
              compare
                ? {
                    width: '100%',
                    height: '100%',
                    clipPath: `inset(0 0 0 ${splitPct.toString()}%)`,
                  }
                : { width: '100%', height: '100%' }
            }
          />
        </div>
        {compare && <CompareSlider value={splitPct} onChange={setSplitPct} />}
      </div>
      <div className="flex items-center justify-end">
        <ZoomControls
          scale={viewport.transform.scale}
          onZoomIn={() => viewport.zoomBy(1.25)}
          onZoomOut={() => viewport.zoomBy(0.8)}
          onFit={viewport.fit}
          onActualSize={() => viewport.setZoom(1)}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 9.2 — Type-check the editor package**

```bash
pnpm --filter @pixflow/editor exec tsc --noEmit
```
Expected: 0 errors. (`ZoomControls` and `CompareSlider` were committed in Tasks 7 and 8, so all imports resolve.)

- [ ] **Step 9.3 — Commit**

```bash
git add packages/editor/src/components/CanvasViewport.tsx
git commit -m "feat(editor): CanvasViewport with stacked canvases, transform, ZoomControls"
```

---

## Task 10 — App integration

**Why:** swap the dev scaffolding for the real viewport, but keep DropZone as the empty-state and DevStatePanel's preset buttons (still useful pre-Inspector). Wrap with `EditorContextProvider` so the GPU device exists.

**Files:**
- Modify: `packages/editor/src/App.tsx`

- [ ] **Step 10.1 — Replace the body of `App.tsx`**

`ZoomControls` is already mounted inside `CanvasViewport` (Task 9 Step 9.1), so `App.tsx` just needs to: wrap the tree in `EditorContextProvider`, render `CanvasViewport` + `DevStatePanel` when `document` is non-null, and `DropZone` otherwise.

Replace the entire contents of `packages/editor/src/App.tsx` with:

```typescript
import { CanvasViewport } from './components/CanvasViewport';
import { DevStatePanel } from './components/DevStatePanel';
import { DropZone } from './components/DropZone';
import { HistoryIndicator } from './components/HistoryIndicator';
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
            pre-alpha · PR #5
          </span>
        </div>
        <div className="flex items-center gap-3">
          <WebGPUStatus />
          <HistoryIndicator />
        </div>
      </header>

      {document ? (
        <>
          <CanvasViewport />
          <DevStatePanel />
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <DropZone />
        </div>
      )}

      <footer className="flex items-center justify-between font-[var(--font-mono)] text-[11px] text-[var(--color-muted)]">
        <span>imported pixflow v{pixflowPkg.version}</span>
        <span>Drop image · ⌘Z undo · ⇧⌘Z redo · Space pan · / compare · +/− zoom</span>
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
Expected: 0 type errors. Unit tests = PR #4's 58 + new from Tasks 1/2/3/4 (4 + 5 + 4 + 9 = 22) = 80 total.

- [ ] **Step 10.3 — Build the bundle and report sizes**

```bash
pnpm --filter @pixflow/editor build
```
Expected: build succeeds. Note the new JS / gzip sizes from the Vite output for the memory update in Task 11.3.

- [ ] **Step 10.4 — Commit**

```bash
git add packages/editor/src/App.tsx
git commit -m "feat(editor): mount EditorContextProvider + viewport in App shell"
```

---

## Task 11 — Browser smoke test + memory update

**Why:** GPU code can only be validated end-to-end. This is the gate before merge.

- [ ] **Step 11.1 — Start the dev server**

```bash
pnpm --filter @pixflow/editor dev
```
Expected output: `Local: http://localhost:5175` (or 5176 if 5175 is taken).

- [ ] **Step 11.2 — Manual checklist (in browser)**

Open the URL and verify each of these. Take a screenshot if anything looks off and surface it before merging.

1. **Empty state shows DropZone** — page loads, header shows WebGPU pill + history indicator (← 0 · 0 →), DropZone is centered.
2. **Drop / click loads an image** — viewport appears, image is fit to container (you can see the entire image), no console errors.
3. **Pan with Space + drag** — hold Space (cursor → grab), drag — image translates.
4. **Zoom with Ctrl/Cmd + wheel** — zooms around mouse position, ZoomControls percentage updates.
5. **Click Fit** — re-centers and fits.
6. **Click 1:1** — scales to 100%, image may overflow container (clipping is expected).
7. **Press `/`** — compare slider appears (vertical line + handle); drag it left/right; original (un-edited) shows on one side, current edited preview on the other. Press `/` again to dismiss.
8. **Apply a preset from DevStatePanel** — press one of the preset buttons. The edited canvas should re-render visibly within ~50ms; HistoryIndicator increments to `← 1 · 0 →`.
9. **Undo (⌘Z)** — preview reverts; counts → `← 0 · 1 →`.
10. **Redo (⇧⌘Z)** — preview re-applies.
11. **Resize window** — preview re-decodes at the new container size; no flicker beyond a one-frame blank.
12. **Drop a *different* image** — old preview is disposed (no GPU memory leak warning), new image appears.
13. **Console clean** — no React warnings, no WebGPU validation errors, no "GPUDevice destroyed" or "Texture associated with [Device]…" errors.

If item 7 fails because the original-canvas painting raced with the edited-canvas first render, suspect Task 7's `useEffect` for the original canvas — it depends on `previewBitmap` which arrives from the engine setup; verify the dependency array.

- [ ] **Step 11.3 — Update memory snapshot**

Edit `/Users/buraksahin/.claude/projects/-Users-buraksahin-Desktop-pixflow-latest/memory/project_editor_rollout.md`:
- Mark PR #5 as ✅ merged with commit hash
- Update `Current state of editor package`:
  - Add `src/context/`: editor-context.ts, EditorContextProvider.tsx
  - Add `src/preview/`: preview-bitmap.ts, preview-engine.ts
  - Add `src/viewport/`: viewport-state.ts, use-viewport.ts, use-preview-render.ts
  - Add `src/components/`: CanvasViewport.tsx, ZoomControls.tsx, CompareSlider.tsx
  - Update test count: 58 → 80 (preview-bitmap 5, preview-engine 4, viewport-state 9, editor-context 4)
  - Update bundle size from the actual `pnpm --filter @pixflow/editor build` output
- Bump `🔜 PR #5` line into ✅ and add `🔜 PR #6: Inspector — Geometry + Color sections`

- [ ] **Step 11.4 — Final commit + PR-recap commit**

```bash
git add docs/superpowers/plans/2026-04-17-pr05-canvas-viewport.md
git commit -m "docs: PR #5 plan (canvas viewport + zoom/pan + compare)"
```

(The plan doc itself counts as the per-PR plan committed alongside the code.)

---

## Verification gates summary

| Gate | When | How |
|---|---|---|
| Unit tests green | After Tasks 1–4 | `pnpm --filter @pixflow/editor test --run` — 22 new tests pass |
| Type-check clean | After Tasks 5, 6, 9 | `pnpm --filter @pixflow/editor exec tsc --noEmit` — 0 errors |
| Bundle builds | After Task 10 | `pnpm --filter @pixflow/editor build` — succeeds; report new JS / gzip sizes |
| Browser smoke | Task 11 | All 13 checklist items pass; clean console |

---

## Risks & known sharp edges

- **Pixflow's preview render time on large images.** PR #4 has no preview at all, so this PR is the first time we exercise pixflow at "interactive" cadence. If a 4000×3000 source produces a 2048×1536 preview that takes >32ms per state change, undo / redo feels janky. Mitigation: the `RunOptions.canvas` side-effect path skips the blob-encode roundtrip on screen. If still slow, drop preview cap from 2048 → 1536 in `preview-bitmap.ts` constants.
- **`ResizeObserver` not in older Safari.** We feature-detect (`typeof ResizeObserver === 'undefined'`) and skip — viewport just won't re-fit on resize, which degrades gracefully.
- **React 19 strict-mode double mount in dev.** `EditorContextProvider`'s `useMemo(createEditorContext)` runs once per mount; the cleanup destroys the device. In dev, the second mount creates a fresh context (and acquires a new device). This is fine for dev — slightly wasteful, but avoids any stale-device hazards. Production runs once.
- **`useEditStore.subscribe` API shape.** The plan uses the `(state, prev) => {}` callback form. Zustand v5 supports both that and the selector-form `(selector, listener)`. If TypeScript complains, switch to the selector form (commented in Task 6.2). Both work; the selector form is more efficient because it only re-fires when the selected slice changes.
- **`textureToBlob` writes RGBA to a 2D canvas via `putImageData`.** This is CPU work that scales with preview pixel count. At 2048×1536 it's ~2ms on M1 — acceptable. The `textureToCanvas` GPU-direct path would be faster, but pixflow's `Pipeline#run` doesn't expose it; using it would require a fork or a follow-up library change. Out of scope for PR #5; flag for PR #15 (perf pass).
