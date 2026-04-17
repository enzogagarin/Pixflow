# PR #7 — Inspector Detail + Overlay (watermark) sections

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the right-rail Inspector with two new accordion sections — `Detail` (sharpen + blur) and `Overlay` (watermark; face-blur stub deferred to PR #10) — so the user can apply the remaining single-image edits without leaving the editor.

**Architecture:** Reuse PR #6's `InspectorSlider`, `useSliderDrag`, and Radix Accordion primitives. Two new section components mirror the per-section pattern from `GeometrySection` / `ColorSection`. The watermark file picker decodes the user-chosen file to an `ImageBitmap` via `createImageBitmap` and commits a default-shaped `WatermarkSpec` (position `bottom-right`, opacity 0.5, scale 0.2, margin 16) — no new pixflow API; the spec field already plumbs straight to `pipeline.watermark()` from PR #3.

**Tech stack:**
- Existing Radix primitives from PR #6 (`@radix-ui/react-accordion`, `react-toggle-group` for the position picker)
- `immer` for nested writes (`d.detail.sharpen.amount = v`)
- Existing `useSliderDrag` + `InspectorSlider` shared components
- Vitest (node env) for inspector-prefs additions

**Critical contracts to honor** (verified by reading `packages/pixflow/src/filters/{watermark,unsharp-mask,gaussian-blur}.ts`):
- `WatermarkParams.image: ImageBitmap | Blob | HTMLImageElement` (required); `position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center' | 'tile'` (default `'bottom-right'`); `opacity?: number ∈ [0, 1]` (default 0.5); `scale?: number ∈ [0, 1]` (default 0.2); `margin?: number ≥ 0` (default 16). Pixflow throws on out-of-range.
- `UnsharpMaskParams.amount, radius: number` (both required, ≥ 0).
- `GaussianBlurParams.radius: number` (required, ≥ 0); `sigma?: number` (derived if omitted). EditState exposes only `sigma`; `stateToPipeline` derives `radius = ceil(sigma × 3)` (existing PR #3 bridge).
- EditState shapes (from `state/types.ts`):
  - `detail: { sharpen: { amount, radius } | null; blur: { sigma } | null }`
  - `watermark: WatermarkSpec | null` where `WatermarkSpec = WatermarkParams` (re-export)
- `setPresent(next)` for live-preview drag, `commit(next)` for one-shot clicks (checkbox enable/disable, position change, file pick), `commit(next, { baseline })` for slider drags via `useSliderDrag`.

**What this PR does NOT do** (deferred):
- Face-blur subsection in Overlay — depends on `pixelate`/`regionBlur` filters (PR #8) and the BlazeFace detect service (PR #10). A disabled stub renders to make the placement obvious.
- Interactive crop tool — out of the spec's PR table (no PR slot assigned). The `Geometry > Crop` button stays disabled.
- Watermark tile-mode preview thumbnail variations — the picker just shows the source image as-is.
- Watermark image format restrictions beyond `accept="image/*"` — same minimal validation as the main DropZone.

---

## File structure

**New files:**
- `packages/editor/src/components/inspector/DetailSection.tsx` — Sharpen + Blur subsections; each uses an enable-checkbox that swaps `state.detail.sharpen|blur` between `null` and a default object, then renders `InspectorSlider`s for the active fields.
- `packages/editor/src/components/inspector/OverlaySection.tsx` — Wraps `WatermarkConfig`; renders a disabled face-blur stub block underneath.
- `packages/editor/src/components/inspector/WatermarkConfig.tsx` — Hidden `<input type="file">` + "Pick image" button → decodes to `ImageBitmap` → commits `WatermarkSpec`. When set, shows a thumbnail + position `Segmented` + opacity/scale/margin `InspectorSlider`s + "Remove" button.

**Modified files:**
- `packages/editor/src/state/inspector-prefs.ts` — Extend `SectionId` union to `'geometry' | 'color' | 'detail' | 'overlay'`. Add `'detail'` and `'overlay'` to `VALID_SECTIONS`. `DEFAULT_PREFS.openSections` stays `['geometry', 'color']` per spec ("default open on first load").
- `packages/editor/test/inspector-prefs.test.ts` — Update existing valid-id assertions; add 1 test that confirms `'detail'` and `'overlay'` survive the load-time filter when stored.
- `packages/editor/src/components/inspector/Inspector.tsx` — Add two more `Accordion.Item`s rendering `<DetailSection />` and `<OverlaySection />` after the existing Geometry + Color items.

**Files left untouched:** `state-to-pipeline.ts` already handles `state.detail.sharpen`, `state.detail.blur`, and `state.watermark` correctly (PR #3 + PR #5's empty-pipeline guard). No render path changes needed; the new sections just write to the same EditState slots.

---

## Task 1 — Extend `SectionId` to include detail + overlay

**Why first:** Inspector accordion in Task 6 needs the new ids registered as valid; the load-time filter would strip them otherwise.

**Files:**
- Modify: `packages/editor/src/state/inspector-prefs.ts`
- Modify: `packages/editor/test/inspector-prefs.test.ts`

- [ ] **Step 1.1 — Add a failing test**

Edit `packages/editor/test/inspector-prefs.test.ts`. Inside `describe('loadPrefs')`, append after the existing `'round-trips a valid prefs object'` test:

```typescript
  it('accepts detail and overlay as valid section ids', () => {
    const custom: InspectorPrefs = {
      openSections: ['geometry', 'color', 'detail', 'overlay'],
    };
    savePrefs(custom);
    expect(loadPrefs()).toEqual(custom);
  });

  it('filters out unknown section ids while keeping known ones', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ openSections: ['geometry', 'unknown', 'detail'] }),
    );
    expect(loadPrefs()).toEqual({ openSections: ['geometry', 'detail'] });
  });
```

- [ ] **Step 1.2 — Run test (expected: fail)**

```bash
pnpm --filter @pixflow/editor test --run inspector-prefs
```
Expected: 2 failures. The `accepts detail and overlay…` test fails because the `loadPrefs` filter currently strips `'detail'` and `'overlay'` (they're not in `VALID_SECTIONS`).

- [ ] **Step 1.3 — Extend the type + valid set**

Edit `packages/editor/src/state/inspector-prefs.ts`. Replace the `SectionId` line and `VALID_SECTIONS` constant:

```typescript
export type SectionId = 'geometry' | 'color' | 'detail' | 'overlay';
```

```typescript
const VALID_SECTIONS: ReadonlySet<SectionId> = new Set<SectionId>([
  'geometry',
  'color',
  'detail',
  'overlay',
]);
```

`DEFAULT_PREFS.openSections` is intentionally unchanged — spec says "default open on first load: Geometry + Color".

- [ ] **Step 1.4 — Run test (expected: pass)**

```bash
pnpm --filter @pixflow/editor test --run inspector-prefs
```
Expected: `8 passed` (6 existing + 2 new).

- [ ] **Step 1.5 — Type-check (downstream consumers still compile)**

```bash
pnpm --filter @pixflow/editor exec tsc --noEmit
```
Expected: 0 errors. `Inspector.tsx`'s `toggleSection` cast `(toggled as SectionId)` already accepts the wider union without change.

- [ ] **Step 1.6 — Commit**

```bash
git add packages/editor/src/state/inspector-prefs.ts packages/editor/test/inspector-prefs.test.ts
git commit -m "feat(editor): extend SectionId with detail + overlay (PR #7 part 1/5)"
```

---

## Task 2 — `DetailSection` (sharpen + blur subsections)

**Files:**
- Create: `packages/editor/src/components/inspector/DetailSection.tsx`

- [ ] **Step 2.1 — Implement `DetailSection.tsx`**

Create `packages/editor/src/components/inspector/DetailSection.tsx`:

```typescript
import { produce } from 'immer';
import { useCallback } from 'react';
import { useEditStore } from '../../state/store';
import type { EditState } from '../../state/types';
import { InspectorSlider } from './InspectorSlider';

const DEFAULT_SHARPEN = { amount: 0.3, radius: 1 };
const DEFAULT_BLUR = { sigma: 2 };

/**
 * Detail inspector. Two independent subsections, each with an enable
 * checkbox that toggles the EditState slot between `null` and a
 * default-shaped object. While enabled, sliders edit the active fields.
 *
 *   ☐ Sharpen
 *       Amount  [─────●─────] 0.30
 *       Radius  [──●────────] 1.0
 *   ☐ Blur
 *       Sigma   [──●────────] 2.0
 *
 * Defaults match the spec mockup (Section 4): sharpen amount 0.3 +
 * radius 1.0, blur sigma 2.0. Reset values match defaults so
 * double-click on a slider returns to the on-enable initial value
 * rather than zero (zero would visually disable the filter and feel
 * inconsistent with the still-checked enable box).
 */
export function DetailSection() {
  const document = useEditStore((s) => s.document);

  const toggleSharpen = useCallback((enabled: boolean) => {
    const store = useEditStore.getState();
    if (!store.document) return;
    store.commit(
      produce(store.document.present, (d) => {
        d.detail.sharpen = enabled ? { ...DEFAULT_SHARPEN } : null;
      }),
    );
  }, []);

  const toggleBlur = useCallback((enabled: boolean) => {
    const store = useEditStore.getState();
    if (!store.document) return;
    store.commit(
      produce(store.document.present, (d) => {
        d.detail.blur = enabled ? { ...DEFAULT_BLUR } : null;
      }),
    );
  }, []);

  const setSharpenAmount = useCallback(
    (v: number): EditState =>
      produce(useEditStore.getState().document!.present, (d) => {
        if (d.detail.sharpen) d.detail.sharpen.amount = v;
      }),
    [],
  );
  const setSharpenRadius = useCallback(
    (v: number): EditState =>
      produce(useEditStore.getState().document!.present, (d) => {
        if (d.detail.sharpen) d.detail.sharpen.radius = v;
      }),
    [],
  );
  const setBlurSigma = useCallback(
    (v: number): EditState =>
      produce(useEditStore.getState().document!.present, (d) => {
        if (d.detail.blur) d.detail.blur.sigma = v;
      }),
    [],
  );

  if (!document) return null;
  const { sharpen, blur } = document.present.detail;

  return (
    <div className="flex flex-col gap-4 p-3">
      <div className="flex flex-col gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-2">
        <label className="flex items-center gap-2 font-[var(--font-mono)] text-xs">
          <input
            type="checkbox"
            checked={sharpen !== null}
            onChange={(e) => toggleSharpen(e.target.checked)}
            className="accent-[var(--color-accent)]"
          />
          <span>Sharpen</span>
        </label>
        {sharpen && (
          <div className="flex flex-col gap-3 pl-1">
            <InspectorSlider
              label="Amount"
              value={sharpen.amount}
              min={0}
              max={2}
              step={0.05}
              resetValue={DEFAULT_SHARPEN.amount}
              precision={2}
              getNextState={setSharpenAmount}
            />
            <InspectorSlider
              label="Radius"
              value={sharpen.radius}
              min={0.5}
              max={3}
              step={0.1}
              resetValue={DEFAULT_SHARPEN.radius}
              precision={1}
              getNextState={setSharpenRadius}
            />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-2">
        <label className="flex items-center gap-2 font-[var(--font-mono)] text-xs">
          <input
            type="checkbox"
            checked={blur !== null}
            onChange={(e) => toggleBlur(e.target.checked)}
            className="accent-[var(--color-accent)]"
          />
          <span>Blur</span>
        </label>
        {blur && (
          <div className="flex flex-col gap-3 pl-1">
            <InspectorSlider
              label="Sigma"
              value={blur.sigma}
              min={0.5}
              max={20}
              step={0.5}
              resetValue={DEFAULT_BLUR.sigma}
              precision={1}
              getNextState={setBlurSigma}
            />
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2.2 — Type-check**

```bash
pnpm --filter @pixflow/editor exec tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 2.3 — Commit**

```bash
git add packages/editor/src/components/inspector/DetailSection.tsx
git commit -m "feat(editor): DetailSection with sharpen + blur subsections (PR #7 part 2/5)"
```

---

## Task 3 — `WatermarkConfig` (file picker + position + sliders)

**Files:**
- Create: `packages/editor/src/components/inspector/WatermarkConfig.tsx`

- [ ] **Step 3.1 — Implement `WatermarkConfig.tsx`**

Create `packages/editor/src/components/inspector/WatermarkConfig.tsx`:

```typescript
import { produce } from 'immer';
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useEditStore } from '../../state/store';
import type { EditState, WatermarkSpec } from '../../state/types';
import type { WatermarkPosition } from 'pixflow';
import { InspectorSlider } from './InspectorSlider';
import { Segmented } from './Segmented';

const POSITION_OPTIONS: readonly { value: WatermarkPosition; label: string }[] = [
  { value: 'top-left', label: 'TL' },
  { value: 'top-right', label: 'TR' },
  { value: 'bottom-left', label: 'BL' },
  { value: 'bottom-right', label: 'BR' },
  { value: 'center', label: 'C' },
  { value: 'tile', label: 'Tile' },
];

const WATERMARK_DEFAULTS = {
  position: 'bottom-right' as const satisfies WatermarkPosition,
  opacity: 0.5,
  scale: 0.2,
  margin: 16,
};

/**
 * Watermark picker + config. UX flow:
 *   - No watermark: shows "Pick image" button. Click → file dialog →
 *     decode → commit { image, ...defaults }.
 *   - Watermark set: shows a small thumbnail + "Replace" + "Remove"
 *     buttons + the position segmented + opacity / scale / margin
 *     sliders, all bound to state.watermark fields.
 *
 * Pixflow's WatermarkParams accepts ImageBitmap | Blob | HTMLImageElement.
 * We always decode to ImageBitmap here so the runtime never has to do
 * second-pass decoding; matches how the main DropZone handles the
 * source image (PR #4).
 *
 * Memory: replacing or removing a watermark drops the previous bitmap
 * reference but does NOT call .close() — past history entries may still
 * hold it. HISTORY_MAX (50) bounds the worst case at 50 retained
 * bitmaps; acceptable for a session-only editor.
 */
export function WatermarkConfig() {
  const watermark = useEditStore((s) => s.document?.present.watermark ?? null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Derive a thumbnail URL whenever the watermark image changes.
  // We turn the ImageBitmap back into a blob via a canvas just to get a
  // displayable src — there's no DOM-native ImageBitmap renderer for
  // <img>. URL.createObjectURL is paired with a cleanup revoke to avoid
  // leaks across re-renders.
  useEffect(() => {
    if (!watermark) {
      setThumbnailUrl(null);
      return;
    }
    const image = watermark.image;
    if (!(image instanceof ImageBitmap)) {
      setThumbnailUrl(null);
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(image, 0, 0);
    let url: string | null = null;
    canvas.toBlob((blob) => {
      if (!blob) return;
      url = URL.createObjectURL(blob);
      setThumbnailUrl(url);
    });
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [watermark]);

  const onPickFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onFileChange = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    e.target.value = ''; // reset so picking the same file twice still fires
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError(`"${file.name}" is not an image file.`);
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const store = useEditStore.getState();
      if (!store.document) return;
      const next: WatermarkSpec = store.document.present.watermark
        ? { ...store.document.present.watermark, image: bitmap }
        : { image: bitmap, ...WATERMARK_DEFAULTS };
      store.commit(
        produce(store.document.present, (d) => {
          d.watermark = next;
        }),
      );
    } catch (err) {
      setError(`Failed to decode ${file.name}: ${String(err)}`);
    }
  }, []);

  const onRemove = useCallback(() => {
    const store = useEditStore.getState();
    if (!store.document) return;
    store.commit(
      produce(store.document.present, (d) => {
        d.watermark = null;
      }),
    );
  }, []);

  const onPositionChange = useCallback((next: WatermarkPosition) => {
    const store = useEditStore.getState();
    if (!store.document?.present.watermark) return;
    store.commit(
      produce(store.document.present, (d) => {
        if (d.watermark) d.watermark.position = next;
      }),
    );
  }, []);

  const setOpacity = useCallback(
    (v: number): EditState =>
      produce(useEditStore.getState().document!.present, (d) => {
        if (d.watermark) d.watermark.opacity = v;
      }),
    [],
  );
  const setScale = useCallback(
    (v: number): EditState =>
      produce(useEditStore.getState().document!.present, (d) => {
        if (d.watermark) d.watermark.scale = v;
      }),
    [],
  );
  const setMargin = useCallback(
    (v: number): EditState =>
      produce(useEditStore.getState().document!.present, (d) => {
        if (d.watermark) d.watermark.margin = v;
      }),
    [],
  );

  return (
    <div className="flex flex-col gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-[var(--font-mono)] text-xs">Watermark</span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFileChange}
          aria-hidden="true"
          tabIndex={-1}
        />
        {watermark ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onPickFile}
              className="rounded border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-2 py-0.5 font-[var(--font-mono)] text-[10px] text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="rounded border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-2 py-0.5 font-[var(--font-mono)] text-[10px] text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              Remove
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onPickFile}
            className="rounded border border-[var(--color-accent)] bg-[var(--color-accent-dim)] px-2 py-0.5 font-[var(--font-mono)] text-[10px] text-[var(--color-accent)] hover:brightness-110"
          >
            Pick image
          </button>
        )}
      </div>

      {error !== null && (
        <p className="font-[var(--font-mono)] text-[10px] text-[var(--color-muted)]">{error}</p>
      )}

      {watermark && (
        <>
          {thumbnailUrl && (
            <img
              src={thumbnailUrl}
              alt="Watermark preview"
              className="max-h-16 w-fit self-start rounded border border-[var(--color-border)] bg-[var(--color-bg-elev)] object-contain"
            />
          )}
          <div className="flex items-center justify-between">
            <span className="font-[var(--font-mono)] text-xs text-[var(--color-muted)]">
              Position
            </span>
            <Segmented
              value={watermark.position ?? WATERMARK_DEFAULTS.position}
              options={POSITION_OPTIONS}
              onChange={onPositionChange}
              ariaLabel="Watermark position"
            />
          </div>
          <InspectorSlider
            label="Opacity"
            value={watermark.opacity ?? WATERMARK_DEFAULTS.opacity}
            min={0}
            max={1}
            step={0.05}
            resetValue={WATERMARK_DEFAULTS.opacity}
            precision={2}
            getNextState={setOpacity}
          />
          <InspectorSlider
            label="Scale"
            value={watermark.scale ?? WATERMARK_DEFAULTS.scale}
            min={0.05}
            max={1}
            step={0.05}
            resetValue={WATERMARK_DEFAULTS.scale}
            precision={2}
            getNextState={setScale}
          />
          <InspectorSlider
            label="Margin"
            value={watermark.margin ?? WATERMARK_DEFAULTS.margin}
            min={0}
            max={100}
            step={1}
            resetValue={WATERMARK_DEFAULTS.margin}
            precision={0}
            getNextState={setMargin}
          />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3.2 — Type-check**

```bash
pnpm --filter @pixflow/editor exec tsc --noEmit
```
Expected: 0 errors. (`WatermarkPosition` is exported from `pixflow`'s top-level index per `packages/pixflow/src/index.ts:81`. `WatermarkSpec` is re-exported from `state/types.ts:90`.)

- [ ] **Step 3.3 — Commit**

```bash
git add packages/editor/src/components/inspector/WatermarkConfig.tsx
git commit -m "feat(editor): WatermarkConfig with file picker + position + opacity/scale/margin sliders (PR #7 part 3/5)"
```

---

## Task 4 — `OverlaySection` (wraps WatermarkConfig + face-blur stub)

**Files:**
- Create: `packages/editor/src/components/inspector/OverlaySection.tsx`

- [ ] **Step 4.1 — Implement `OverlaySection.tsx`**

Create `packages/editor/src/components/inspector/OverlaySection.tsx`:

```typescript
import { useEditStore } from '../../state/store';
import { WatermarkConfig } from './WatermarkConfig';

/**
 * Overlay inspector section. Houses two subgroups per spec Section 4:
 *   - Watermark (live this PR)
 *   - Face blur (stubbed; arrives with PR #10's face-detect service)
 *
 * The face-blur stub is intentionally rendered (greyed out) so users
 * see the eventual feature surface and roadmap signaling.
 */
export function OverlaySection() {
  const document = useEditStore((s) => s.document);
  if (!document) return null;

  return (
    <div className="flex flex-col gap-4 p-3">
      <WatermarkConfig />

      <div className="flex flex-col gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-2 opacity-50">
        <span className="font-[var(--font-mono)] text-xs">Face blur</span>
        <p className="font-[var(--font-mono)] text-[10px] text-[var(--color-muted)]">
          Face detection ships in PR #10 (BlazeFace + safety review UI).
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4.2 — Type-check**

```bash
pnpm --filter @pixflow/editor exec tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4.3 — Commit**

```bash
git add packages/editor/src/components/inspector/OverlaySection.tsx
git commit -m "feat(editor): OverlaySection wraps WatermarkConfig + face-blur stub (PR #7 part 4/5)"
```

---

## Task 5 — Inspector shell update

**Files:**
- Modify: `packages/editor/src/components/inspector/Inspector.tsx`

- [ ] **Step 5.1 — Add Detail + Overlay accordion items**

Edit `packages/editor/src/components/inspector/Inspector.tsx`. Add two new imports:

```typescript
import { DetailSection } from './DetailSection';
import { OverlaySection } from './OverlaySection';
```

Then, inside the `<Accordion.Root>` block, append after the `Color` `Accordion.Item`:

```tsx
        <Accordion.Item value="detail" className="border-t border-[var(--color-border)]">
          <Accordion.Header>
            <Accordion.Trigger className="flex w-full items-center justify-between px-3 py-2 font-[var(--font-mono)] text-xs hover:bg-[var(--color-bg)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] data-[state=open]:text-[var(--color-accent)]">
              <span>Detail</span>
              <span aria-hidden="true" className="data-[state=open]:rotate-90">▸</span>
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content>
            <DetailSection />
          </Accordion.Content>
        </Accordion.Item>

        <Accordion.Item value="overlay" className="border-t border-[var(--color-border)]">
          <Accordion.Header>
            <Accordion.Trigger className="flex w-full items-center justify-between px-3 py-2 font-[var(--font-mono)] text-xs hover:bg-[var(--color-bg)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] data-[state=open]:text-[var(--color-accent)]">
              <span>Overlay</span>
              <span aria-hidden="true" className="data-[state=open]:rotate-90">▸</span>
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content>
            <OverlaySection />
          </Accordion.Content>
        </Accordion.Item>
```

Leave Geometry's `border-b` and Color's no-border as-is. Detail's `border-t` provides the Color/Detail separator; Overlay's `border-t` provides the Detail/Overlay separator. Geometry's `border-b` provides the Geometry/Color separator. Three borders, one per pair — symmetric without doubling up.

- [ ] **Step 5.2 — Type-check + run all tests**

```bash
pnpm --filter @pixflow/editor exec tsc --noEmit
pnpm --filter @pixflow/editor test --run
```
Expected: 0 type errors. Tests = PR #6's 102 + 2 new (`'accepts detail and overlay…'` + `'filters out unknown section ids'`) = 104.

- [ ] **Step 5.3 — Build the bundle and report sizes**

```bash
pnpm --filter @pixflow/editor build
```
Expected: build succeeds. Note the new JS / gzip sizes (probably +10 KB JS / +3 KB gzip — three new component files, no new deps).

- [ ] **Step 5.4 — Commit**

```bash
git add packages/editor/src/components/inspector/Inspector.tsx
git commit -m "feat(editor): mount Detail + Overlay sections in Inspector accordion (PR #7 part 5/5)"
```

---

## Task 6 — Browser smoke + memory snapshot + merge

**Why:** the new sections live or die by their interaction; verify in the browser, then close out the PR.

- [ ] **Step 6.1 — Start the dev server**

```bash
pnpm --filter @pixflow/editor dev
```
Expected: `Local: http://localhost:5175` (or 5176 if 5175 is taken).

- [ ] **Step 6.2 — Manual checklist (in browser)**

Open the URL and verify each item. Take a screenshot if anything looks off.

1. **Empty state** — DropZone centered, no Inspector visible.
2. **Drop image** — Inspector appears on the right with **four** accordion sections: Geometry, Color, Detail, Overlay. Geometry + Color open by default; Detail + Overlay closed.
3. **Click Detail header** — section expands; Sharpen + Blur subsection rectangles visible, both **unchecked**.
4. **Check Sharpen** — Amount + Radius sliders appear (defaults 0.30 + 1.0). Image visibly sharpens. HistoryIndicator increments.
5. **Drag Amount slider** — image gets sharper / softer in real time; release adds **one** history entry.
6. **Drag Radius slider** — same drag discipline.
7. **Double-click Amount slider row** — resets to 0.30; one history entry.
8. **Uncheck Sharpen** — sliders disappear; image returns to pre-sharpen look; history increments.
9. **Check Blur** — Sigma slider appears (default 2.0); image blurs.
10. **Drag Blur sigma** to 10 — image blurs heavily; release commits.
11. **Click Overlay header** — section expands; Watermark subsection visible with "Pick image" button; Face blur stub visible (greyed out, "ships in PR #10" message).
12. **Click "Pick image"** — file picker opens. Choose any image (e.g. another photo, a small logo).
13. **After pick** — thumbnail appears; Position segmented (TL/TR/BL/BR/C/Tile); Opacity/Scale/Margin sliders. Image now shows the chosen watermark in **bottom-right** corner (default position) at 20% scale, 50% opacity.
14. **Click Position TL** — watermark jumps to top-left; HistoryIndicator increments.
15. **Click Position Tile** — watermark tiles across the image.
16. **Click "Replace"** — file picker reopens. Pick a different image. Thumbnail + image overlay both update.
17. **Drag Opacity to 0.1** — watermark becomes nearly invisible. Drag back to 1.0 — fully opaque. One history entry per drag.
18. **Click "Remove"** — watermark disappears; "Pick image" button returns; history +1.
19. **Reset button (top of Inspector)** — when ANY of {sharpen, blur, watermark, geometry, color edits} is non-default, Reset is enabled. Click → all sliders reset, watermark removed, image returns to original. ⌘Z brings everything back.
20. **Hard-refresh** — accordion remembers its open/closed state. Open Detail + Overlay → reload → both stay open.
21. **Compare slider (`/`)** — works with all the layered edits applied. Half shows pristine; half shows sharpened + blurred + watermarked image.
22. **Console clean** — no React / Radix warnings, no PixflowError, no GPU validation errors, no unhandled promise rejections.

If a slider drag pushes multiple history entries (one per emit) instead of one, regress to PR #6's `useSliderDrag` test — the `baselineRef` discipline should already handle this. If picking a watermark image causes a "Pipeline has no filters" error, the `state-to-pipeline` empty-state guard from PR #5 should still kick in (`brightness(0)` no-op); confirm `stateToPipeline` is still appending it. If watermark causes "watermark.opacity must be in [0, 1]", the slider min/max enforcement is broken — verify `InspectorSlider` props.

- [ ] **Step 6.3 — Update memory snapshot**

After successful smoke + merge, edit `/Users/buraksahin/.claude/projects/-Users-buraksahin-Desktop-pixflow-latest/memory/project_editor_rollout.md`:
- Mark PR #7 as ✅ merged with the merge commit hash.
- Update the editor package state list:
  - Add `src/components/inspector/`: DetailSection.tsx, OverlaySection.tsx, WatermarkConfig.tsx
  - Update `SectionId` note: now 4 sections (geometry, color, detail, overlay)
  - Update test count: 102 → 104 (inspector-prefs +2)
  - Update bundle size from the actual `pnpm --filter @pixflow/editor build` output
- Bump `🔜 PR #7` → ✅ and add `🔜 PR #8: pixflow pixelate + regionBlur filters (parallel-eligible)`.

Update `MEMORY.md` index entry to "PR #1–7 merged".

- [ ] **Step 6.4 — Invoke `superpowers:finishing-a-development-branch` skill**

After all 22 smoke items pass cleanly, the executing-plans skill hands off to the finishing skill, which presents the 4 merge options. The user's established convention is Option 1 (local merge to `main`) — confirm before acting.

---

## Verification gates summary

| Gate | When | How |
|---|---|---|
| Unit tests green | After Task 1 | `pnpm --filter @pixflow/editor test --run` — 2 new tests in inspector-prefs |
| Type-check clean | After Tasks 2, 3, 4, 5 | `pnpm --filter @pixflow/editor exec tsc --noEmit` — 0 errors |
| Bundle builds | After Task 5 | `pnpm --filter @pixflow/editor build` — succeeds; report sizes |
| Browser smoke | Task 6 | All 22 checklist items pass; clean console |

---

## Risks & known sharp edges

- **Watermark thumbnail decode race.** The `useEffect` that draws the watermark `ImageBitmap` to a canvas + `toBlob` + `createObjectURL` is async. If the user replaces the watermark twice in quick succession, two effects race and one's revoke may run after the other's setSrc. Consequence: a stale `<img src>` may be revoked early → broken-image icon flickers. The `useEffect` cleanup function (returning `() => URL.revokeObjectURL(url)`) is the right pattern; React 19 invokes cleanup before the next effect fires, so the worst case is a one-frame flash. Acceptable.
- **`createImageBitmap` with non-image files.** `accept="image/*"` is hint-only; users can still drag bizarre files via Finder. The `file.type.startsWith('image/')` check + try/catch around `createImageBitmap` cover the obvious cases. Pixflow itself rejects unsupported sources at filter-construction time.
- **Watermark position `Segmented` cramped at 320 px.** Six options + label could overflow. Labels use 1–4 chars (TL/TR/BL/BR/C/Tile) to stay narrow. If overflow happens, drop "Tile" to a separate full-width row.
- **Blur sigma 20 + sharpen amount 2 are both aggressive ranges.** Pixflow accepts them but at sigma 20 the gaussian-blur pass is GPU-expensive (radius derived ≈ 60). At preview resolution (≤ 2048 × longest edge from PR #5) it's still under 100ms on a M1 — verified via PR #5 perf budget. If users complain, cap UI sigma at 10.
- **State.detail.sharpen.amount range mismatch with photoshop convention.** Our slider is [0, 2]; Photoshop's "Amount" is [0, 500%]. Internal-consistency note for spec drift, not a bug.
- **No InspectorSlider for `precision={0}`?** The Margin slider uses `precision={0}` which means `(16).toFixed(0) === '16'`. The numeric input still uses `step={1}`, so arrow-key behaves correctly. Confirmed before plan was finalized.
- **Watermark on undo retains old ImageBitmap reference.** As noted in WatermarkConfig.tsx comments: HISTORY_MAX = 50 caps total retained bitmaps. PR #14 (PWA / cleanup) is the right place for explicit memory pressure handling if it becomes an issue.
