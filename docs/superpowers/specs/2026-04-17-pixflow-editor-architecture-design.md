# Pixflow Editor — Architecture Design

**Status:** Draft · awaiting user review
**Date:** 2026-04-17
**Scope:** Full architectural blueprint for evolving pixflow from a WebGPU image-processing library into a privacy-first, client-side photo editor PWA.

---

## Executive summary

Pixflow today is a fluent WebGPU image-processing library with a vanilla-JS demo. This spec describes its evolution into a **privacy-first, client-side photo editor** delivered as a PWA — no uploads, no telemetry, all processing on the user's GPU.

The library (`pixflow`) remains a standalone npm package. A new editor application (`@pixflow/editor`) is added as a consumer, with an optional ML sub-package (`@pixflow/editor-ml`) for on-device face detection. The existing `landing/` page is unchanged. Everything lives in a single pnpm monorepo.

**Product decisions fixed in brainstorming:**

| Decision | Choice | Rationale |
|---|---|---|
| Editor paradigm | Single-session (no persistent projects) | Matches the "nothing stored anywhere" privacy claim; avoids OPFS/eviction complexity |
| Package layout | Library + editor + editor-ml as separate packages | Keeps library story intact; ML never enters main bundle |
| ML scope | Face detection only (BlazeFace); no background removal in MVP | Bg removal is a solved problem; face blur is a real differentiator |
| Multi-image UX | Single active canvas + separate batch mode | Minimizes GPU resource pressure and UI complexity |
| Threat model | Sensitive-privacy (B): aggressive metadata + safety UI, without hard guarantees | Matches "journalists/activists" positioning honestly |
| Core state model | Parameter-state (immutable `EditState` + snapshot history) | Maps 1:1 to pixflow's fluent API; simplest undo/redo |

**Non-goals (explicit):**
- Layer-based editing (Photoshop-style)
- Project files / persistent documents
- Cloud sync / account system
- Hard safety guarantees for activist use (the tool is "best-effort" — documented)
- Mobile-first optimization (works on mobile, but pro UX is desktop)

---

## Section 1 — Monorepo layout & package boundaries

### Physical layout

```
pixflow/
  packages/
    pixflow/                    ← library (npm: "pixflow")
      src/                      ← moved from repo root src/
      test/
      dist/
      package.json
      tsconfig.json
      tsup.config.ts
    editor/                     ← main product UI (internal-only or npm: "@pixflow/editor")
      src/
        app/                    ← routing, top-level shell
        state/                  ← EditState, history, zustand store
        render/                 ← stateToPipeline adapter, preview + export engines
        components/             ← React components (inspector sections, canvas, top bar)
        metadata/               ← metadata strippers per format
        ml/                     ← service wrapper that dynamically imports editor-ml
        workers/                ← (future) offscreen encoders
      public/                   ← PWA manifest, icons
      index.html
      package.json
    editor-ml/                  ← optional ML (npm: "@pixflow/editor-ml")
      src/
        face/                   ← BlazeFace entry, session, pre/post-process
        loader/                 ← model fetch + SHA-256 integrity + Cache API
      models/                   ← BlazeFace ONNX + hash file (build-time asset)
      package.json
    landing/                    ← existing marketing page, unchanged
  examples/
    vanilla-js/                 ← existing demo, consumes pixflow via workspace
  docs/
    superpowers/specs/          ← design docs live here
  pnpm-workspace.yaml
```

### Dependency graph (unidirectional — no cycles)

```
editor  ──▶  pixflow                 (dependency: workspace:* + peer)
editor  ──▶  editor-ml/face          (dynamic import only — lazy)
editor  ──▶  pixflow/internal        (TexturePool, acquireDevice)
examples/vanilla-js  ──▶  pixflow
landing               (self-contained)
```

### Public/internal API discipline

- **`pixflow`** public entry: `Pipeline`, `PRESETS`, `PixflowError`, all filters. Subject to semver commitment.
- **`pixflow/internal`** new entry: `TexturePool`, `acquireDevice`, `PipelineCache`. No semver commitment; intended for the editor and advanced library users. Exposed via `package.json` `exports` field:
  ```json
  {
    "exports": {
      ".":          { "types": "./dist/index.d.ts",          "import": "./dist/index.js" },
      "./internal": { "types": "./dist/internal/index.d.ts", "import": "./dist/internal/index.js" }
    }
  }
  ```
- **`@pixflow/editor`** has no public API surface — it's an application, not a library. Only `index.html` + bundled JS ships.
- **`@pixflow/editor-ml/face`** sub-path export, so dynamic import (`import('@pixflow/editor-ml/face')`) targets only the face-detection chunk.

### Build/dev commands

| Command | Scope |
|---|---|
| `pnpm -w install` | All packages |
| `pnpm --filter pixflow test` | Library unit tests |
| `pnpm --filter @pixflow/editor dev` | Editor Vite dev server (port 5173) |
| `pnpm --filter landing dev` | Landing dev (port 5174) |
| `pnpm --filter pixflow build` | Library bundle via tsup |
| `pnpm --filter @pixflow/editor build` | Editor static build |
| `pnpm -w typecheck` | All packages |
| `pnpm -w test` | All package tests |

### Decisions

- Editor package name `@pixflow/editor` (private, not published to npm in MVP — marked `"private": true`). Revisit if community asks for self-host distribution.
- Brand name stays "Pixflow" for the editor. Separate product name not adopted.

---

## Section 2 — `EditState` data model & history

### Principle

`EditState` is both **UI state and render state** — the same immutable object drives the inspector controls and feeds `stateToPipeline`. There is no separate "UI state" layer.

### Schema

```typescript
interface EditState {
  // ── source (set at load, immutable for the session) ──
  readonly source: {
    readonly bitmap: ImageBitmap;
    readonly file: File;
    readonly exif: ExifTable;
    readonly naturalWidth: number;
    readonly naturalHeight: number;
  };

  // ── geometry (applied in order: crop → rotate → flip) ──
  readonly geometry: {
    readonly crop: { x: number; y: number; w: number; h: number } | null;
    readonly rotate: 0 | 90 | 180 | 270;
    readonly flip: { h: boolean; v: boolean };
  };

  // ── color (all applied in a single color pass) ──
  readonly color: {
    readonly brightness: number;        // [-1, 1]
    readonly contrast:   number;        // [-1, 1]
    readonly saturation: number;        // [-1, 1]
    readonly whiteBalance: {
      readonly temperature: number;     // [-1, 1]
      readonly tint:        number;     // [-1, 1]
    };
  };

  // ── detail ──
  readonly detail: {
    readonly sharpen: { amount: number; radius: number } | null;  // amount [0, 2]
    readonly blur:    { sigma: number } | null;                    // sigma (0, 20]
  };

  // ── overlays ──
  readonly watermark: WatermarkSpec | null;
  readonly faceBlur: {
    readonly boxes: readonly FaceBox[];              // original bitmap coordinates
    readonly style: 'pixelate' | 'gaussian';
    readonly strength: number;                       // [0, 1]
  } | null;

  // ── export ──
  readonly output: {
    readonly resize: { maxWidth?: number; maxHeight?: number; fit: 'inside' | 'cover' } | null;
    readonly format: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif';
    readonly quality: number;           // [0, 1]; ignored for PNG
    readonly metadataStrip: MetadataStripSpec;
  };
}

interface MetadataStripSpec {
  readonly mode: 'aggressive' | 'minimal' | 'preserve';
}

interface FaceBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly confidence: number;          // [0, 1]
}
```

### Default state

```typescript
function freshState(file: File, bitmap: ImageBitmap, exif: ExifTable): EditState {
  return {
    source: { bitmap, file, exif, naturalWidth: bitmap.width, naturalHeight: bitmap.height },
    geometry: { crop: null, rotate: 0, flip: { h: false, v: false } },
    color: {
      brightness: 0, contrast: 0, saturation: 0,
      whiteBalance: { temperature: 0, tint: 0 },
    },
    detail: { sharpen: null, blur: null },
    watermark: null,
    faceBlur: null,
    output: {
      resize: null,
      format: 'image/webp',
      quality: 0.9,
      metadataStrip: { mode: 'aggressive' },    // safe default
    },
  };
}
```

### History model

```typescript
interface EditHistory {
  readonly past: readonly EditState[];
  readonly present: EditState;
  readonly future: readonly EditState[];
}
```

- **`commit(newState)`**: push current present to past, set newState as present, clear future.
- **`undo()`**: pop from past, current present moves to future.
- **`redo()`**: pop from future, current present moves to past.

**Debounce-vs-commit UX discipline:**
- Slider `onInput` → update `present` only (preview re-renders, no history commit).
- Slider `onChange` (release) → commit to history.

**Memory budget:**
- Max 50 entries. 51st commit evicts oldest past entry.
- `EditState` ≈ 500 bytes excluding `source`; `source.bitmap` is shared by reference across all snapshots. Total ≈ 25 KB.

### Preset integration

```typescript
// packages/editor/src/state/presets.ts
function applyPreset(state: EditState, preset: PresetName): EditState {
  switch (preset) {
    case 'avatar':
      return {
        ...state,
        output:  { ...state.output, resize: { maxWidth: 256, maxHeight: 256, fit: 'cover' } },
        detail:  { ...state.detail, sharpen: { amount: 0.4, radius: 1 } },
      };
    case 'blog-hero':
      return {
        ...state,
        output: { ...state.output, resize: { maxWidth: 1600, maxHeight: 900, fit: 'cover' } },
        color:  { ...state.color, saturation: 0.1 },
        detail: { ...state.detail, sharpen: { amount: 0.25, radius: 1 } },
      };
    case 'forum-post':
      return {
        ...state,
        output: { ...state.output, resize: { maxWidth: 1200, fit: 'inside' } },
        detail: { ...state.detail, sharpen: { amount: 0.3, radius: 1 } },
      };
    case 'ecommerce-thumbnail':
      return {
        ...state,
        output: { ...state.output, resize: { maxWidth: 600, maxHeight: 600, fit: 'cover' } },
        detail: { ...state.detail, sharpen: { amount: 0.5, radius: 1 } },
      };
  }
}
```

Presets are **starting points** — the user applies a preset, then fine-tunes via the inspector. This is Yaklaşım 1's natural usage pattern.

### Decisions

- **Immutability via `immer`.** 6 KB cost accepted for cleaner reducer code.
- **`faceBlur.boxes` live in original bitmap coordinate space**, not crop-space. A `remapBoxesForCrop()` helper transforms at render time, so changing the crop doesn't invalidate detection results.

---

## Section 3 — Edit pipeline & render flow

### Principle

A single pure function (`stateToPipeline`) is the entire editor's source of render truth. Preview and export both flow through it — "preview ≠ export" divergence is architecturally impossible.

### Two render modes

```
                     ┌────────────────────────────┐
  UI input (60fps)   │  PREVIEW RENDER            │
        │            │  • downscaled bitmap       │
        ▼            │  • format = image/png      │
  EditState  ───────▶│  • quality = 1             │──▶ canvas draw
                     │  • metadata strip: OFF     │
                     └────────────────────────────┘
                                  │
                          (Export button)
                                  ▼
                     ┌────────────────────────────┐
                     │  EXPORT RENDER             │
                     │  • full resolution bitmap  │
                     │  • state.output.format     │
                     │  • state.output.quality    │
                     │  • metadata strip: ON      │
                     └────────────────────────────┘
                                  │
                                  ▼
                      Blob (download after audit)
```

### `stateToPipeline` adapter

```typescript
function stateToPipeline(state: EditState, mode: 'preview' | 'export'): Pipeline {
  const p = Pipeline.create();

  // 1. Geometry
  if (state.geometry.crop)   p.crop(state.geometry.crop);
  if (state.geometry.rotate) p.rotate90((state.geometry.rotate / 90) as 1 | 2 | 3);
  if (state.geometry.flip.h) p.flip('horizontal');
  if (state.geometry.flip.v) p.flip('vertical');

  // 2. Color
  const c = state.color;
  if (c.brightness !== 0) p.brightness(c.brightness);
  if (c.contrast   !== 0) p.contrast(c.contrast);
  if (c.saturation !== 0) p.saturation(c.saturation);
  if (c.whiteBalance.temperature !== 0 || c.whiteBalance.tint !== 0) {
    p.whiteBalance(c.whiteBalance);
  }

  // 3. Detail
  if (state.detail.sharpen) p.unsharpMask(state.detail.sharpen);
  if (state.detail.blur)    p.gaussianBlur(state.detail.blur);

  // 4. Face blur (boxes remapped to current crop-space)
  if (state.faceBlur) {
    const remapped = remapBoxesForCrop(state.faceBlur.boxes, state.geometry.crop);
    if (state.faceBlur.style === 'pixelate') {
      p.pixelate({ regions: remapped, blockSize: Math.round(32 * state.faceBlur.strength) });
    } else {
      p.regionBlur({ regions: remapped, sigma: 20 * state.faceBlur.strength });
    }
  }

  // 5. Watermark
  if (state.watermark) p.watermark(state.watermark);

  // 6. Output
  if (state.output.resize) p.resize(state.output.resize);
  p.encode({
    format:  mode === 'preview' ? 'image/png' : state.output.format,
    quality: mode === 'preview' ? 1           : state.output.quality,
  });

  return p;
}
```

### Preview engine (interactive, 60fps target)

```typescript
class PreviewEngine {
  private pendingRender: AbortController | null = null;
  private lastState: EditState | null = null;
  private previewBitmap: ImageBitmap;

  constructor(private canvas: HTMLCanvasElement, source: ImageBitmap, maxSize: number) {
    this.previewBitmap = downscaleToMax(source, maxSize);
  }

  requestRender(state: EditState): void {
    if (state === this.lastState) return;       // referential equality short-circuit
    this.lastState = state;

    this.pendingRender?.abort();                // cancel-and-restart
    this.pendingRender = new AbortController();
    const signal = this.pendingRender.signal;

    requestAnimationFrame(() => void this.renderFrame(state, signal));
  }

  private async renderFrame(state: EditState, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return;
    const pipeline = stateToPipeline(state, 'preview');
    try {
      const result = await pipeline.run(this.previewBitmap, { signal });
      if (signal.aborted) return;
      await drawBlobToCanvas(this.canvas, result.blob);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') console.error(err);
    }
  }
}
```

**Preview downscale size:** dynamic — `containerWidth × window.devicePixelRatio`, clamped to `[512, 2048]`. Ensures Retina sharpness without GPU stall.

### Export engine

```typescript
async function exportDocument(state: EditState, ctx: EditorContext): Promise<ExportResult> {
  const pipeline = stateToPipeline(state, 'export');
  const pixflowResult = await pipeline.run(state.source.bitmap, {
    device: ctx.device, pool: ctx.pool, cache: ctx.cache,
  });

  const stripResult = await applyMetadataStrip(
    pixflowResult.blob,
    state.output.metadataStrip,
    state.source.exif,
  );

  return {
    blob: stripResult.blob,
    width: pixflowResult.width,
    height: pixflowResult.height,
    format: pixflowResult.stats.format,
    audit: buildAuditReport(state, pixflowResult, stripResult),
  };
}
```

### Shared GPU context

```typescript
class EditorContext {
  readonly device: GPUDevice;
  readonly pool: TexturePool;
  readonly cache: PipelineCache;

  static async create(): Promise<EditorContext> {
    const { device } = await acquireDevice();
    return new EditorContext(device, new TexturePool(device), new PipelineCache(device));
  }

  destroy(): void {
    this.pool.dispose();
    this.cache.dispose();
    this.device.destroy();
  }
}
```

- One `EditorContext` per page load (single-session paradigm).
- Passed to every `pipeline.run()` call.
- Destroyed on `beforeunload`.

### Performance budget

| Event | Target latency | Strategy |
|---|---|---|
| Slider drag (onInput) | < 16 ms | cancel-and-restart + downscaled preview |
| Slider release (commit) | < 100 ms | history push + full preview render |
| Preset apply | < 50 ms | single state mutation |
| Undo/redo | < 20 ms | state swap (pipeline cache hit) |
| Export 4000×3000 | < 200 ms | full-res render + encode |
| Face detect cold start | < 3 s | ML loader; subsequent calls < 500 ms |

### Decisions

- **`pixelate` and `regionBlur` are added to pixflow's public API** — valuable to library users beyond the editor.
- **Preview downscale is dynamic** based on container size and DPR.

---

## Section 4 — UI component taxonomy & UX

### Design language

- **Dark-first theme** (consistent with demo and privacy-tool idiom).
- **Radix UI primitives** + Tailwind CSS v4 utility-first styling.
- **Typography:** Inter (UI) + JetBrains Mono (numeric / technical).
- **Motion:** 150–220 ms ease-out on state transitions only. Respects `prefers-reduced-motion`.
- **Icons:** Lucide (consistent 1px stroke, tree-shakable).

### Top-level layout

```
┌──────────────────────────────────────────────────────────────────┐
│  TOP BAR                                                         │
│  [logo] filename.jpg · 4032×3024            ⇤ ⇥  [Export ▾]      │
├─────────┬─────────────────────────────────────────┬──────────────┤
│         │                                         │              │
│  LEFT   │                                         │  RIGHT       │
│  RAIL   │                                         │  INSPECTOR   │
│         │           CANVAS VIEWPORT               │              │
│  Tools  │      (zoom/pan, before/after slider)    │  Geometry ▾  │
│         │                                         │  Color ▾     │
│  Mode   │                                         │  Detail ▾    │
│  (Edit/ │                                         │  Overlay ▾   │
│  Batch) │                                         │  Export ▾    │
│         │                                         │              │
├─────────┴─────────────────────────────────────────┴──────────────┤
│  BOTTOM BAR                                                      │
│  100% ⊖⊕⊙   ·   ⟳ 3 steps · 🛡 Export Audit: 3 faces, 12 fields  │
└──────────────────────────────────────────────────────────────────┘
```

### Left rail (tools)

| Icon | Tool | Shortcut |
|---|---|---|
| ◈ | Mode: Edit | — |
| ▦ | Mode: Batch | — |
| ↘ | Select / move | `V` |
| ⬚ | Crop | `C` |
| ✻ | Face detect (triggers ML load on first click) | `F` |
| ◐ | Before/after compare | `/` |
| ✋ | Hand / pan | `H` / hold Space |

Active tool state lives in the zustand store; the canvas component reads it and interprets pointer events accordingly.

### Right inspector — accordion sections

Each section maps 1:1 to an `EditState` subtree. Sections open/close independently; preference persists in `localStorage`.

**Default open on first load:** Geometry + Color.

Inspector contents per section:

```
▾ Geometry
    Rotate:  0  [90]  180  270       (segmented)
    Flip:    ☐ Horizontal  ☐ Vertical
    Crop:    [Enter crop tool]

▾ Color
    Brightness  ──────●──────  0.00   (slider + numeric; double-click → reset)
    Contrast    ──────●──────  0.00
    Saturation  ──────●──────  0.00
    White bal.  [Temp] [Tint]         (expand for two slaves)

▾ Detail
    ☐ Sharpen
        Amount   ─────●────── 0.30
        Radius   ──●───────── 1.0
    ☐ Blur
        Sigma    ──●───────── 2.0

▾ Overlay
    ☐ Watermark  [Pick image] [Config ▾]
    ☐ Face blur  [⚡ Detect]  3 faces found [Preview] [Confirm]

▾ Export
    Format:    ○ JPEG  ● WebP  ○ PNG  ○ AVIF
    Quality:   ────●────── 90
    Max size:  [Unlimited ▾]
    Metadata:  ● Aggressive  ○ Minimal  ○ Preserve
               ⓘ expand to see which fields get stripped
    [🛡 Export with audit ▸]
```

### Canvas viewport behavior

- **Zoom:** trackpad pinch, Ctrl/Cmd + wheel, `+`/`−` keys, bottom bar slider
- **Pan:** space + drag (Photoshop convention), two-finger trackpad drag
- **Before/after:** hold `` ` `` to temporarily show original; or `/` toggles compare-slider overlay
- **Crop:** `C` → canvas shows resize handles + rule-of-thirds grid
- **Face-blur preview:** after detection, each face gets a soft overlay box + confidence label; hover reveals blur preview; click toggles selection
- **Fine control:** Alt + drag = fine (0.01 step), Shift + drag = coarse (0.1 step)

### Bottom bar — persistent safety surface

```
100% ⊖⊕⊙    ·    ⟳ 3 steps undoable    ·    🛡 Export Audit: 3 faces, 12 EXIF fields
```

Clicking the audit indicator opens the export audit modal (Section 6).

### Keyboard shortcuts

| Key | Action |
|---|---|
| `V` / `C` / `F` / `H` | Tool switch |
| `Space` (hold) | Temporary pan |
| `Cmd/Ctrl+Z` / `Shift+Cmd+Z` | Undo / redo |
| `Cmd+E` | Export |
| `[` / `]` | Step through history |
| `0` | Fit to screen |
| `1` | 100% zoom |
| `/` | Compare mode toggle |
| `` ` `` (hold) | Show original |
| `Esc` | Exit active tool |
| `?` | Shortcuts cheatsheet |

### Mode switching

- **Edit mode (default):** one active image, full inspector, real-time preview.
- **Batch mode:** canvas becomes a thumbnail grid of all dropped files. Inspector defines the shared parameters to apply. UX is "apply to all, remove unwanted" — user drops files, removes any they don't want batched.

**Batch mode state model:** a single "template" `EditState` holds all non-source parameters (geometry, color, detail, overlays, output). On "Apply to all", for each file the app constructs a per-file `EditState` = `{ ...template, source: fileSource }` and passes it to `stateToPipeline(perFileState, 'export')`. Results ZIP and download. Preview shows the template applied to the currently-selected thumbnail. Face blur in batch mode requires per-file detection (faces are image-specific), so the "Detect" button in batch mode runs sequentially across files on demand.

### Responsive behavior

- **≥ 1200 px:** three-column layout.
- **900–1200 px:** right inspector narrows to 280 px.
- **< 900 px:** left rail becomes bottom tab bar; right inspector becomes bottom sheet.

Mobile-first optimization is **not** a goal. Pro UX targets desktop.

### Accessibility baseline

- All controls keyboard-accessible (Radix guarantees).
- `prefers-reduced-motion` respected (transitions skipped).
- ARIA labels on every control; `aria-valuenow` on sliders; `aria-pressed` on toggles.
- Visible focus rings.
- WCAG AA contrast minimum; critical states (errors, audit warnings) AAA.

### Empty / loading / error states

| State | Behavior |
|---|---|
| First load | Large drop zone + sample image "Try it" link |
| WebGPU unavailable | Full-screen message with supported browser list |
| Face-detect loading | Progress on tool button: "Model downloading (2 MB)" |
| Render error | Toast with detail expander + "Reset filters" action |
| GPU device lost | Full-screen recovery UI: "GPU disconnected, please reload" |

### Tech stack

| Layer | Choice |
|---|---|
| Framework | React 19 |
| Store | Zustand + immer middleware |
| Styling | Tailwind CSS v4 |
| Primitives | Radix UI |
| Icons | Lucide |
| Router | Not included (or `wouter` 2 KB if needed for `/batch` route) |
| Build | Vite |

---

## Section 5 — Face detection + ML module loading

### Principle

ML code and models never enter the main editor bundle. On first face-detect click, the `@pixflow/editor-ml/face` sub-module is dynamically imported; the model is fetched from the same origin, verified against a build-time SHA-256, and persisted in `Cache API`.

### Runtime and model choices

| Component | Choice | Size | Rationale |
|---|---|---|---|
| Runtime | ONNX Runtime Web 1.20+ | ~10 MB (WASM + WebGPU EP) | WebGPU execution provider; same GPU substrate as pixflow |
| Model | BlazeFace full-range (ONNX) | ~2 MB | MediaPipe-family, robust across poses/ages; box-only (no mesh) |
| Licensing | Apache 2.0 | — | Commercial use permitted |

Total first-load cost: ~12 MB, fetched once then Cache-API cached.

### Package internal structure

```
packages/editor-ml/
  src/
    face/
      index.ts                      ← public entry (detectFaces, prepareSession)
      blazeface-session.ts          ← ONNX session singleton
      preprocess.ts                 ← bitmap → tensor (192×192 normalize)
      postprocess.ts                ← anchor decode + NMS → FaceBox[]
    loader/
      fetch-with-integrity.ts       ← Cache-first fetch + SHA-256 verify
      model-registry.ts             ← pinned URL + hash per model
  models/
    blazeface.onnx                  ← source-of-truth model asset
    blazeface.sha256                ← generated by build script
  scripts/
    generate-hash.ts                ← reads model, writes .sha256, inlines into model-registry.ts
  package.json
```

**Model asset pipeline:**

1. Model files live at `packages/editor-ml/models/` (LFS recommended).
2. Build script `generate-hash.ts` runs pre-build: computes SHA-256, writes it into `model-registry.ts` as a compile-time constant, and writes `.sha256` sidecar. CI fails if the inlined hash doesn't match the model's actual hash (integrity gate against accidental model swaps).
3. At editor build time, a Vite plugin (or `vite-plugin-static-copy`) copies `packages/editor-ml/models/*` into `packages/editor/public/models/`. These assets ship alongside the editor bundle, same-origin.
4. `model-registry.ts` uses `new URL('/models/blazeface.onnx', import.meta.url)` → resolves to the editor origin at runtime. `fetchWithIntegrity` hits the local path, Cache-API stores it.

### Public API

```typescript
export interface FaceBox {
  readonly x: number;         // original bitmap coordinates
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly confidence: number; // [0, 1]
}

export interface DetectOptions {
  readonly minConfidence?: number;
  readonly maxFaces?: number;
  readonly signal?: AbortSignal;
  readonly onProgress?: (phase: 'loading' | 'ready' | 'running') => void;
  readonly device?: GPUDevice;
}

export async function prepareSession(opts?: { onProgress?: (phase: string) => void }): Promise<void>;

export async function detectFaces(
  source: ImageBitmap,
  options?: DetectOptions,
): Promise<readonly FaceBox[]>;
```

### Editor-side dynamic loading

```typescript
class FaceDetectService {
  private module: typeof import('@pixflow/editor-ml/face') | null = null;
  private loadingPromise: Promise<void> | null = null;

  async ensureLoaded(onPhase: (phase: string) => void): Promise<void> {
    if (this.module) return;
    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = (async () => {
      onPhase('fetching-code');
      const mod = await import('@pixflow/editor-ml/face');

      onPhase('fetching-model');
      await mod.prepareSession({ onProgress: onPhase });

      this.module = mod;
    })();
    return this.loadingPromise;
  }

  async detect(bitmap: ImageBitmap, device: GPUDevice, signal: AbortSignal) {
    if (!this.module) throw new Error('Call ensureLoaded() first');
    return this.module.detectFaces(bitmap, { device, signal, minConfidence: 0.6 });
  }
}
```

### Integrity — SHA-256 pinning

Model integrity is critical. A compromised model could produce detection misses in sensitive photos — a safety failure under threat model B.

```typescript
export const MODELS = {
  blazeface: {
    url: new URL('/models/blazeface.onnx', import.meta.url).toString(),
    sha256: 'a3f9e8b2d7c1...',   // populated by build script
    size: 2_184_320,
  },
} as const;

async function fetchWithIntegrity(spec: ModelSpec, signal?: AbortSignal): Promise<ArrayBuffer> {
  const cache = await caches.open('pixflow-models-v1');
  const cached = await cache.match(spec.url);
  if (cached) {
    const buf = await cached.arrayBuffer();
    if (await sha256(buf) === spec.sha256) return buf;
    await cache.delete(spec.url);   // corrupt cache — re-fetch
  }

  const resp = await fetch(spec.url, { signal, cache: 'force-cache' });
  if (!resp.ok) throw new Error(`Model fetch failed: ${resp.status}`);
  const buf = await resp.arrayBuffer();

  const hash = await sha256(buf);
  if (hash !== spec.sha256) {
    throw new Error(`Model integrity check failed: expected ${spec.sha256}, got ${hash}`);
  }
  await cache.put(spec.url, new Response(buf.slice(0), { headers: resp.headers }));
  return buf;
}

async function sha256(buf: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}
```

- Model hosted **same-origin** (no third-party CDN) — consistent with privacy positioning.
- SHA-256 is a compile-time constant. Build script reads the model, computes the hash, and inlines it. CI fails on mismatch.
- Cache bucket `pixflow-models-v1` is versioned; bumping to `v2` evicts old models.

### Session lifecycle

```typescript
let session: ort.InferenceSession | null = null;

export async function prepareSession(opts: { onProgress?: (p: string) => void } = {}) {
  if (session) return;
  opts.onProgress?.('loading-model');
  const buf = await fetchWithIntegrity(MODELS.blazeface);

  opts.onProgress?.('initializing-runtime');
  session = await ort.InferenceSession.create(buf, {
    executionProviders: ['webgpu', 'wasm'],
    graphOptimizationLevel: 'all',
  });
  opts.onProgress?.('ready');
}

export async function detectFaces(bitmap: ImageBitmap, options: DetectOptions = {}) {
  if (!session) throw new Error('Session not prepared');
  const tensor = await preprocess(bitmap, 192);
  const outputs = await session.run({ input: tensor }, { signal: options.signal });
  return postprocess(outputs, bitmap.width, bitmap.height, options);
}
```

- Session is a module-level singleton; page-lifetime resident.
- ORT WebGPU EP creates its own GPU device (cannot reliably share with pixflow's device as of 2026). ~30–50 MB extra VRAM on iGPU. Acceptable.
- Post-processing (anchor decode, NMS) runs on CPU in pure JS — typically < 5 ms.

### Safety UI flow (threat model B)

```
User clicks [⚡ Detect]
    ↓
[Loading model… 72%]          first-time progress
    ↓
[Running detection…]          ~200–500 ms
    ↓
3 faces found                 canvas overlays soft boxes + confidence
┌────────────────────────┐
│ ☑ Face 1 · 0.94 conf   │
│ ☑ Face 2 · 0.88 conf   │
│ ☑ Face 3 · 0.71 conf ⚠ │  low-confidence warning
│                        │
│ + Add manually (M)     │  rectangle tool for false negatives
└────────────────────────┘

Style:  ● Pixelate  ○ Gaussian
Strength: ────●────── 0.7

⚠ Best-effort detection. Verify every face in preview before exporting.
```

**Safety rules:**
- Low-confidence detections (< 0.80) are pre-selected **but** rendered with a yellow border. User must actively review.
- Manual face-add is mandatory — false negatives must be correctable.
- Disclaimer is permanent and non-dismissable in the face-blur section.

### State integration

`EditState.faceBlur.boxes` holds the detected boxes in original bitmap coordinates. Unchecking a face removes it from the array. Changing crop, rotate, or flip does not invalidate the boxes — the render adapter transforms them on the fly.

### pixflow additions

Two new filters added to pixflow's public API:

- `Pipeline.pixelate({ regions, blockSize })` — region-specific average-block pixelation.
- `Pipeline.regionBlur({ regions, sigma })` — region-specific gaussian blur.

Both are useful to library consumers beyond the editor.

### Decisions

- **Model hosting: same-origin**, served from `/models/` path.
- **WASM threads enabled** for ONNX runtime. Requires `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` headers.

---

## Section 6 — Metadata stripping + Export audit

### Principle

Export is never single-click. It is a **built-in confirmation step** that surfaces what will be stripped, what will be kept, and how many safety-sensitive operations will run. This is the most visible expression of threat model B.

### Metadata surface map

Most "EXIF strippers" only handle JPEG's APP1 segment. That's inadequate.

| Format | Container | May contain | Strip (aggressive)? |
|---|---|---|---|
| JPEG | EXIF (APP1) | GPS, date, camera, lens, software | Yes |
| JPEG | **EXIF thumbnail** (APP1 sub-field) | Miniature original (160×120 JPEG) | **Yes — critical** |
| JPEG | ICC profile (APP2) | Color profile | Optional |
| JPEG | XMP (APP1) | Adobe metadata, copyright, software chain | Yes |
| JPEG | Comments (COM) | User comments, encoder banners | Yes |
| PNG | `tEXt` / `iTXt` / `zTXt` | Arbitrary key-value | Yes |
| PNG | `eXIf` (PNG 1.5+) | EXIF in PNG | Yes |
| PNG | `iCCP` | ICC profile | Optional |
| WebP | `EXIF` chunk | EXIF | Yes |
| WebP | `XMP ` chunk | XMP | Yes |
| WebP | `ICCP` chunk | ICC | Optional |
| AVIF | `Exif` box | EXIF | Yes |
| AVIF | `mime` box (XMP) | XMP | Yes |

**Critical trap — JPEG thumbnail:** The EXIF segment can contain a 160×120 JPEG thumbnail of the *original* image. If the user crops to hide sensitive content but the stripper leaves the thumbnail, the thumbnail leaks a small copy of the uncropped source. We **always** strip this in aggressive mode.

### Strip modes

| Mode | Removes | Keeps | Use case |
|---|---|---|---|
| **aggressive** (default) | All of the above | Pixel data, dimensions, sRGB (assumed) | Privacy-default |
| **minimal** | GPS, dates, camera/software, thumbnail | Orientation, ICC, technical params | Casual sharing |
| **preserve** | Nothing | All | Power users / archival |

### Implementation strategy — pixflow encode + post-process rewriter

pixflow's `Pipeline.encode()` already drops most metadata (GPU-compute → raw pixels → new encode). But some browsers' fallback encoders may leak. We run a **second, deterministic post-process rewriter**:

```typescript
export async function applyMetadataStrip(
  blob: Blob,
  spec: MetadataStripSpec,
  sourceExif: ExifTable,
): Promise<StripResult> {
  if (spec.mode === 'preserve') return reinjectExif(blob, sourceExif);

  const format = detectFormat(blob);
  switch (format) {
    case 'jpeg': return stripJpeg(blob, spec);
    case 'png':  return stripPng(blob, spec);
    case 'webp': return stripWebp(blob, spec);
    case 'avif': return stripAvif(blob, spec);
  }
}

interface StripResult {
  readonly blob: Blob;
  readonly removedFields: readonly RemovedField[];
  readonly keptFields: readonly string[];
  readonly sizeBefore: number;
  readonly sizeAfter: number;
}

interface RemovedField {
  readonly container: 'EXIF' | 'XMP' | 'ICC' | 'thumbnail' | 'tEXt' | 'iTXt' | 'zTXt' | 'COM';
  readonly name: string;           // e.g. "GPSLatitude"
  readonly value: unknown;         // recorded before deletion, for the audit UI
}
```

### Library choices

- **Reading:** `exifr` (4 KB, covers all formats, pure JS).
- **Writing/stripping:** hand-rolled byte-level rewriters. ~100–200 lines each. Third-party "strippers" can't be audited for what they silently preserve.
  - `stripJpeg` — JPEG segment walker; drop APP1, APP2, COM segments.
  - `stripPng` — PNG chunk walker; keep critical (IHDR, IDAT, IEND) + sRGB, drop others.
  - `stripWebp` — RIFF chunk walker; keep VP8/VP8L/VP8X only.
  - `stripAvif` — ISOBMFF box walker; keep `mdat` + essential `meta` sub-boxes.

### Export audit modal

```
┌─────────────────────────────────────────────────────────────────┐
│  🛡  Export Audit                                            ✕  │
│                                                                 │
│  File: istanbul.jpg → istanbul.pixflow.webp                     │
│  Size: 4.2 MB → 820 KB (80% reduction)                          │
│  Dimensions: 4032×3024 → 1600×1200                              │
│                                                                 │
│  ───────────────  METADATA TO REMOVE (14)  ──────────────────  │
│                                                                 │
│  🌍 GPS location        41.0082° N, 28.9784° E     ⊘ remove    │
│  📅 Capture time        2024-09-15 14:32:18        ⊘ remove    │
│  📷 Camera              iPhone 15 Pro              ⊘ remove    │
│  🛠  Software chain      iOS 18.0, Photos.app       ⊘ remove    │
│  🖼  EXIF thumbnail      160×120 mini-copy          ⊘ remove    │
│  ▸ 9 more technical fields                                      │
│                                                                 │
│  ───────────────  FACE BLUR  ──────────────────                 │
│                                                                 │
│  3 faces will be blurred (pixelate, strength 0.7)              │
│  ☑ Face 1 · conf 0.94    [preview]                             │
│  ☑ Face 2 · conf 0.88    [preview]                             │
│  ☑ Face 3 · conf 0.71 ⚠  [preview — low confidence]            │
│                                                                 │
│  ───────────────  FINAL CHECK  ──────────────────               │
│                                                                 │
│  ⚠ The exported file will contain pixelated regions over        │
│     detected faces. Verify each face box is correctly placed    │
│     in the preview before sharing.                              │
│                                                                 │
│  [📋 Copy audit report]              [Cancel]  [📥 Download]    │
└─────────────────────────────────────────────────────────────────┘
```

**UX rules:**
- Fields shown with **real values** (not abstracted) — user sees concretely what would leak.
- Per-field tooltip explains the field's meaning.
- Low-confidence faces (< 0.80) marked with yellow warning — user must eyeball preview.
- "Copy audit report" produces a markdown table for external audit trail.

### Export flow end-to-end

```
Cmd+E  /  Export button
    ↓
stateToPipeline(state, 'export')            pure function
    ↓
pipeline.run(state.source.bitmap)           pixflow full-res render (pixelate, watermark, encode)
    ↓
applyMetadataStrip(blob, state.output.metadataStrip, state.source.exif)
    ↓
buildAuditReport(state, renderStats, stripResult)
    ↓
[Export Audit modal opens]                  user reviews, confirms
    ↓  [📥 Download]
Blob → URL.createObjectURL → <a download>.click() → revoke after 30s
    ↓
Toast: "✓ Downloaded · audit report in console"
```

### Console audit log

Every export (confirmed or canceled) logs to console:

```
[Pixflow Export Audit · 2026-04-17T14:32:18]
Source:        istanbul.jpg (4.2 MB, 4032×3024, EXIF present)
Output:        istanbul.pixflow.webp (820 KB, 1600×1200)
Operations:    crop=none, rotate=0, brightness=0.15, saturation=0.10,
               sharpen={amount:0.3}, watermark=none,
               faceBlur={boxes:3, style:pixelate, strength:0.7}
Metadata strip mode: aggressive
  Removed:
    EXIF/GPSLatitude         41.008240
    EXIF/GPSLongitude        28.978360
    EXIF/DateTimeOriginal    2024-09-15 14:32:18
    EXIF/Make                Apple
    EXIF/Model               iPhone 15 Pro
    EXIF/ThumbnailImage      [binary, 4832 bytes]
    XMP/xmpMM:DocumentID     ...
    APP2/ICC_Profile         [binary, 3144 bytes]
  Kept (required by format):
    Image data, dimensions, sRGB color space
Final file hash (SHA-256): 7f9c2a...
```

### Testability

- **Snapshot tests** for each stripper against known-metadata fixtures.
- **Mutation tests**: inject new EXIF fields into fixtures, verify stripper catches them.
- **Round-trip tests**: strip output must be re-parseable as a valid image with correct dimensions.
- **Cross-tool verification**: after stripping, parse the output with `exifr` independently; asserted metadata fields must be absent. Two independent readers catch what one might miss.

---

## Section 7 — PWA shell + test strategy + migration path

### PWA architecture

**Goal:** Whether installed or not, the editor works offline after first visit. Every subsequent visit is network-free (model included).

**Service worker strategy** (Workbox):

| Cache | Contents | Strategy | TTL |
|---|---|---|---|
| `pixflow-shell-v{BUILD}` | HTML, JS bundle, CSS, fonts, icons | Precache on install | Per-build; old versions evicted |
| `pixflow-models-v1` | BlazeFace ONNX (future ML models) | Cache-first + SHA-256 verify | Long, via immutable URLs |
| `pixflow-runtime` | Fonts, Lucide SVGs | Stale-while-revalidate | 7 days |

**Network transparency:**
- When the editor is operating on an image, **zero fetch calls** happen. A service-worker listener warns (dev mode) if an external origin is requested.
- First visit shows a one-time notice: "This page makes no network calls while processing — verify in DevTools Network tab."

**`manifest.webmanifest`:**

```json
{
  "name": "Pixflow Editor",
  "short_name": "Pixflow",
  "description": "Private, client-side photo editor. No uploads, ever.",
  "start_url": "/",
  "display": "standalone",
  "display_override": ["window-controls-overlay"],
  "background_color": "#0b0d12",
  "theme_color": "#0b0d12",
  "icons": [/* ... */],
  "file_handlers": [
    {
      "action": "/",
      "accept": {
        "image/jpeg": [".jpg", ".jpeg"],
        "image/png":  [".png"],
        "image/webp": [".webp"],
        "image/avif": [".avif"]
      }
    }
  ],
  "launch_handler": { "client_mode": "focus-existing" }
}
```

`file_handlers`: once installed as a PWA, the OS registers Pixflow as an image handler — right-click any JPEG → "Open with Pixflow Editor". No upload, OS-native UX.

**HTTP headers** (Netlify/Vercel for production, Vite for dev):

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Required for WASM threads / SharedArrayBuffer in ONNX Runtime.

Vite dev server needs the same headers via `server.headers` config:

```typescript
// packages/editor/vite.config.ts
export default defineConfig({
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
```

Without these headers in dev, ONNX Runtime WASM threads silently fall back to single-threaded mode, causing dev/prod performance divergence and hiding regressions.

### Test strategy

| Layer | Tool | Scope |
|---|---|---|
| Unit — pixflow | vitest (existing) | Shaders, color matrix, resize kernel |
| Unit — editor state | vitest | `stateToPipeline`, history reducer, preset application |
| Unit — metadata strippers | vitest + fixtures | Per-format strip → hex-compare with expected output |
| Unit — editor-ml | vitest | BlazeFace postprocess (anchor decode, NMS); model mocked |
| Integration | vitest + headless Chrome | GPU device → pipeline → pixel output; editor store → preview render |
| Safety (critical) | vitest | Round-trip audit: fixture → pipeline → strip → re-read with independent parser |
| Visual regression | Playwright `toHaveScreenshot` | Preview snapshots, PR-level diff |
| E2E | Playwright | Drop → edit → detect → audit → download, per scenario |
| Zero-network proof | Playwright request listener | Fail if any external origin fetched during workflow |
| PWA audit | Lighthouse CI | PWA score, perf budget |

**Zero-network CI test example:**

```typescript
test('editor performs zero external network calls during a full workflow', async ({ page }) => {
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.origin !== 'http://localhost:5173') {
      throw new Error(`Unexpected external request: ${req.url()}`);
    }
  });
  await editor.dropFile('fixtures/istanbul.jpg');
  await editor.applyPreset('forum-post');
  await editor.detectFaces();
  await editor.export();
  // Passes only if no external fetch fired.
});
```

### Migration path

**Phase 0 — Prep:** commit or stash working-tree changes; create `feature/monorepo-migration` branch.

**Phase 1 — Skeleton:**

```bash
mkdir -p packages/pixflow/src
mkdir -p packages/editor/{src,public}
mkdir -p packages/editor-ml/src/{face,loader}
```

**Phase 2 — Move pixflow** (single big `git mv`):

```bash
git mv src/        packages/pixflow/src/
git mv test/       packages/pixflow/test/
git mv tsconfig.json tsconfig.build.json tsup.config.ts vitest.config.ts \
       packages/pixflow/
```

Move pixflow-specific fields from root `package.json` to `packages/pixflow/package.json`. Root becomes workspace-only.

**Phase 3 — Workspace config:**

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
  - 'examples/*'
```

**Phase 4 — Path mapping:**

- Remove root `vite.config.ts` (not needed once pixflow is a built package).
- Update `examples/vanilla-js/tsconfig.json` path map: `"pixflow": ["../../packages/pixflow/src/index.ts"]`.
- Add `examples/vanilla-js/vite.config.ts` with that resolve alias.

**Phase 5 — Scaffold editor:**

```bash
cd packages/editor
pnpm init
pnpm add pixflow@workspace:* react react-dom zustand immer \
         @radix-ui/react-slider @radix-ui/react-dialog @radix-ui/react-dropdown-menu \
         @radix-ui/react-accordion @radix-ui/react-toggle-group \
         tailwindcss lucide-react exifr
pnpm add -D vite @vitejs/plugin-react typescript
```

Seed files: `src/main.tsx`, `src/App.tsx`, `index.html`, `tsconfig.json`, `vite.config.ts`, `tailwind.config.ts`.

**Phase 6 — CI:**

GitHub Actions steps:

```
pnpm -w install
pnpm -w typecheck
pnpm -w test
pnpm --filter pixflow build
pnpm --filter @pixflow/editor build
pnpm --filter @pixflow/editor exec playwright test
```

Deployment:
- Editor → Netlify or Vercel on `main` push.
- pixflow → npm on tagged commit (`pixflow@x.y.z`).

**Phase 7 — PR decomposition:**

| PR | Scope | Blocked by |
|---|---|---|
| #1 | Monorepo skeleton (Phases 1–4). pixflow still works; new packages empty. | — |
| #2 | Editor package boot — minimal shell, imports pixflow, no features. | #1 |
| #3 | `stateToPipeline` adapter + unit tests. | #2 |
| #4 | EditStore (zustand + immer) + history + undo/redo UI. | #3 |
| #5 | Canvas viewport + zoom/pan + before/after overlay. | #4 |
| #6 | Inspector — Geometry + Color sections. | #5 |
| #7 | Detail + Watermark sections. | #6 |
| #8 | pixflow: `pixelate` + `regionBlur` filters. | #3 (parallel) |
| #9 | editor-ml package + fetch-with-integrity loader. | — (parallel) |
| #10 | Face-detect service + safety UI. | #8, #9 |
| #11 | Metadata strippers (4 formats) + test fixtures. | #4 (parallel) |
| #12 | Export audit panel. | #11 |
| #13 | Batch mode UI. | #6 |
| #14 | PWA manifest + service worker + COOP/COEP. | #12 |
| #15 | E2E + "zero-network" test suite. | #14 |
| #16 | Landing "Try the editor" link. | #15 |

Each PR is independently mergeable. Existing `examples/vanilla-js/` demo continues to function through all phases.

### Deployment matrix

| Artifact | Target | Trigger |
|---|---|---|
| pixflow | npm registry | git tag `pixflow@x.y.z` |
| @pixflow/editor | Netlify / Vercel | `main` branch push |
| @pixflow/editor-ml | static asset (bundled with editor) | `main` branch push |
| Landing | existing deploy | `landing/` changes |

Netlify `_headers` snippet:

```
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
```

---

## Open items / risks

- **Browser support narrows:** WebGPU support is ~80% globally, but iOS Safari < 17 and older Firefox require a flag. The editor gracefully degrades to a "WebGPU required" message. A WebGL2 fallback is out of scope for MVP.
- **ONNX Runtime WebGPU EP device sharing** not yet stable. Editor accepts two GPU devices (pixflow + ORT). If ORT stabilizes device sharing, reclaim ~30 MB VRAM in a future minor release.
- **File System Access API** (for batch workflows) is Chrome-only. Fallback = standard file input + download-zip. No fallback for saving-in-place, which is consistent with single-session paradigm anyway.
- **Face detection recall** is ~90% for frontal faces, lower for extreme poses, partial faces, or tiny faces. This is why manual face-add is mandatory.
- **Safety claims:** The app explicitly does NOT claim to be a sufficient tool for high-risk activist use. Prominent disclaimer and audit panel reinforce this.

---

## Success criteria

The architecture is successful if:

1. pixflow remains shippable as a standalone library (library consumers unaffected).
2. Editor bundle excluding ML is **< 500 KB gzipped** (React + Radix + zustand + pixflow + app code).
3. `@pixflow/editor-ml/face` adds ML only on demand; first load **< 3 s** on a warm cache hit.
4. Round-trip audit tests verify metadata stripping with two independent parsers (our walker + `exifr`).
5. E2E "zero-network" test passes in CI — breaking this test blocks merges.
6. Undo/redo renders in **< 20 ms** on a 4000×3000 image.
7. Slider drag maintains **60 fps** through cancel-and-restart render pipeline.
8. PWA `file_handlers` installation allows opening images from OS with zero upload.

---

## Appendix — decisions log

| # | Decision | Choice |
|---|---|---|
| 1 | Editor paradigm | Single-session |
| 2 | Monorepo layout | pixflow + editor + editor-ml + landing |
| 3 | ML scope | Face detection only (BlazeFace) |
| 4 | Multi-image UX | Single canvas + separate batch mode |
| 5 | Threat model | Sensitive privacy (B): aggressive defaults + audit UI, best-effort disclaimer |
| 6 | Core state model | Parameter-state (immutable `EditState` + history) |
| 7 | Immutability library | immer (6 KB) |
| 8 | Face-box coordinate space | Original bitmap coordinates |
| 9 | `pixelate` / `regionBlur` | Added to pixflow public API |
| 10 | Preview downscale | Dynamic: container width × DPR, clamped [512, 2048] |
| 11 | Batch UI | "Apply to all, remove unwanted" |
| 12 | Default open inspector sections | Geometry + Color |
| 13 | Model hosting | Same-origin |
| 14 | WASM threads | Enabled (COOP/COEP required) |
| 15 | Editor npm publish | Private (not published in MVP) |
