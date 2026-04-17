# PR #8 — pixflow `pixelate` + `regionBlur` filters

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two region-gated filters to pixflow's public API — `pixelate` (mosaic-block) and `regionBlur` (gaussian) — as precondition for PR #10 face-blur.

**Architecture:** `PixelateFilter` extends the existing `ComputeFilter<Params>` base (single shader pass); `RegionBlurFilter` follows `GaussianBlurFilter`'s custom two-pass pattern (horizontal + vertical), with a region-gate short-circuit in WGSL. Both accept regions in the input-texture pixel coordinate space (same space the filter receives its texture in), so callers that run `resize`/`crop` earlier are responsible for remapping — this matches how the editor's `remapBoxesForCrop` already works. Identity short-circuit when `regions.length === 0`. Hard cap of 16 regions per filter (realistic face-detect ceiling; uniform buffer sized for this).

**Tech Stack:** TypeScript 5.9 strict, WGSL, WebGPU, vitest (pure unit, no GPU runtime). Follows existing `BrightnessFilter` (simple ComputeFilter) and `GaussianBlurFilter` (custom two-pass) patterns already in the codebase.

---

## File Structure

**Create:**
- `packages/pixflow/src/shaders/pixelate.wgsl.ts` — WGSL: per-pixel region hit-test → snap to block grid → nearest-neighbor sample; else passthrough.
- `packages/pixflow/src/shaders/region-blur.wgsl.ts` — WGSL: per-pixel region hit-test → 1D gaussian sample (direction uniform) inside regions; else passthrough. Identical shader run twice (H then V).
- `packages/pixflow/src/filters/pixelate.ts` — `PixelateFilter` class (extends `ComputeFilter<PixelateParams>`). Exports `Region`, `PixelateParams`.
- `packages/pixflow/src/filters/region-blur.ts` — `RegionBlurFilter` class (custom two-pass, follows `GaussianBlurFilter`). Exports `RegionBlurParams`.
- `packages/pixflow/test/region-filters.test.ts` — unit tests: construction, hashing, validation, identity, outputSize. Mirrors `filters.test.ts`/`watermark.test.ts` style.

**Modify:**
- `packages/pixflow/src/filters/index.ts` — add exports for `PixelateFilter`, `RegionBlurFilter`, and the three param/region types.
- `packages/pixflow/src/pipeline/pipeline.ts` — add `.pixelate(params)` and `.regionBlur(params)` chainable methods near `.watermark()` (lines ~200).
- `examples/vanilla-js/main.ts` — add tiny "Pixelate center" and "Region blur center" buttons for browser smoke (catches WGSL-compile bugs that mocks miss, per `feedback_mock_validation.md`).

**No editor-side changes in this PR.** PR #10 wires the filters into `stateToPipeline`; this PR only ships the library surface.

---

## Shared types (referenced by Task 2 and Task 4)

```typescript
// packages/pixflow/src/filters/pixelate.ts
export interface Region {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface PixelateParams {
  readonly regions: readonly Region[];
  readonly blockSize: number;
}
```

```typescript
// packages/pixflow/src/filters/region-blur.ts
import type { Region } from './pixelate.js';

export interface RegionBlurParams {
  readonly regions: readonly Region[];
  readonly sigma: number;
}
```

`Region` is **defined once in `pixelate.ts`** and re-imported by `region-blur.ts`. The filters/index.ts barrel re-exports `Region` from the `./pixelate.js` path. Coordinates are **input-texture pixels** (the texture the filter receives in `execute()`); callers that pre-transform (crop, resize) must remap regions themselves.

**Shared constants:**
- `MAX_REGIONS = 16` — hard cap enforced in both filter constructors. Uniform buffer sized for this.
- `MIN_BLOCK_SIZE = 2`, `MAX_BLOCK_SIZE = 256` — pixelate block-size validation range.
- `MAX_SIGMA = 32` — regionBlur sigma validation range. Shader's MAX_RADIUS loop uses 96 (≈ 3σ at σ=32).

---

## Task 1: `pixelate` WGSL shader

**Files:**
- Create: `packages/pixflow/src/shaders/pixelate.wgsl.ts`

The shader reads `region_count` regions from a fixed-size `array<vec4i, 16>` uniform. For each output pixel, if inside any region, snap the sample coordinate to a block grid anchored at that region's top-left (so blocks tile from the region origin, not the image origin — keeps the mosaic visually centered on what's being censored). Sample nearest-neighbor from the block's top-left pixel.

- [ ] **Step 1: Create the shader file**

```typescript
// packages/pixflow/src/shaders/pixelate.wgsl.ts
export const PIXELATE_WGSL = /* wgsl */ `
struct Params {
  region_count: u32,
  block_size: u32,
  _pad0: u32,
  _pad1: u32,
  regions: array<vec4i, 16>,
}

@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var outputTex: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: Params;

// Returns the index of the first region containing (x, y), or -1 if none.
// Regions are vec4i(x, y, w, h) in input-texture pixel coords.
fn regionIndexAt(x: i32, y: i32) -> i32 {
  let n = i32(params.region_count);
  for (var i: i32 = 0; i < n; i = i + 1) {
    let r = params.regions[i];
    if (r.z <= 0 || r.w <= 0) { continue; }
    if (x >= r.x && y >= r.y && x < r.x + r.z && y < r.y + r.w) {
      return i;
    }
  }
  return -1;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let dims = textureDimensions(outputTex);
  if (id.x >= dims.x || id.y >= dims.y) { return; }

  let coord = vec2i(i32(id.x), i32(id.y));
  let idx = regionIndexAt(coord.x, coord.y);

  if (idx < 0 || params.block_size == 0u) {
    textureStore(outputTex, coord, textureLoad(inputTex, coord, 0));
    return;
  }

  let r = params.regions[idx];
  let bs = i32(params.block_size);
  // Snap coord to block grid anchored at region top-left.
  let bx = r.x + ((coord.x - r.x) / bs) * bs;
  let by = r.y + ((coord.y - r.y) / bs) * bs;
  let in_dims = textureDimensions(inputTex);
  let max_x = i32(in_dims.x) - 1;
  let max_y = i32(in_dims.y) - 1;
  let sx = clamp(bx, 0, max_x);
  let sy = clamp(by, 0, max_y);
  textureStore(outputTex, coord, textureLoad(inputTex, vec2i(sx, sy), 0));
}
`;
```

**Note on backticks inside WGSL comments:** The template literal uses backticks as delimiters. Do **not** put any backtick-quoted identifier (e.g. `` `foo` ``) inside the WGSL source — esbuild will terminate the template early and the shader will compile as a fragment. This bit us in PR #7 (`watermark.wgsl.ts`). If you need to name a type in a comment, write it bare: `vec2i(u32, u32)` rather than `` `vec2i(u32, u32)` ``.

- [ ] **Step 2: Commit**

```bash
git add packages/pixflow/src/shaders/pixelate.wgsl.ts
git commit -m "feat(pixflow): add pixelate WGSL shader"
```

---

## Task 2: `PixelateFilter`

**Files:**
- Create: `packages/pixflow/src/filters/pixelate.ts`
- Create: `packages/pixflow/test/region-filters.test.ts` (tests added here in this task)

The filter uses the existing `ComputeFilter<Params>` base since it's a single-pass shader. Uniform byte layout: `u32 region_count + u32 block_size + u32 _pad0 + u32 _pad1 + 16 × vec4i regions` = 16 + 256 = 272 bytes (already 16-byte aligned). `outputSize = inputSize` — this filter never resizes.

- [ ] **Step 1: Write the failing test file**

```typescript
// packages/pixflow/test/region-filters.test.ts
import { describe, expect, it } from 'vitest';
import { PixelateFilter, type Region } from '../src/filters/pixelate.js';
import { PixflowError } from '../src/errors.js';

const R: Region = { x: 10, y: 20, w: 80, h: 60 };

describe('PixelateFilter', () => {
  it('stores params and exposes name/stage', () => {
    const f = new PixelateFilter({ regions: [R], blockSize: 8 });
    expect(f.name).toBe('pixelate');
    expect(f.stage).toBe('compute');
    expect(f.params.regions).toHaveLength(1);
    expect(f.params.blockSize).toBe(8);
  });

  it('produces a deterministic hash for identical params', () => {
    const a = new PixelateFilter({ regions: [R], blockSize: 8 });
    const b = new PixelateFilter({ regions: [R], blockSize: 8 });
    expect(a.hash()).toBe(b.hash());
  });

  it('produces different hashes when params differ', () => {
    const a = new PixelateFilter({ regions: [R], blockSize: 8 });
    const b = new PixelateFilter({ regions: [R], blockSize: 16 });
    const c = new PixelateFilter({ regions: [{ ...R, x: 11 }], blockSize: 8 });
    expect(a.hash()).not.toBe(b.hash());
    expect(a.hash()).not.toBe(c.hash());
  });

  it('is identity when regions are empty', () => {
    const f = new PixelateFilter({ regions: [], blockSize: 8 });
    expect(f.isIdentity).toBe(true);
  });

  it('preserves output dimensions', () => {
    const f = new PixelateFilter({ regions: [R], blockSize: 8 });
    expect(f.outputSize?.({ width: 640, height: 480 })).toEqual({
      width: 640,
      height: 480,
    });
  });

  it('rejects blockSize outside [2, 256]', () => {
    expect(() => new PixelateFilter({ regions: [R], blockSize: 1 })).toThrow(PixflowError);
    expect(() => new PixelateFilter({ regions: [R], blockSize: 257 })).toThrow(PixflowError);
    expect(() => new PixelateFilter({ regions: [R], blockSize: 1.5 })).toThrow(PixflowError);
    expect(() => new PixelateFilter({ regions: [R], blockSize: Number.NaN })).toThrow(PixflowError);
  });

  it('rejects more than 16 regions', () => {
    const many: Region[] = Array.from({ length: 17 }, (_, i) => ({ x: i, y: 0, w: 5, h: 5 }));
    expect(() => new PixelateFilter({ regions: many, blockSize: 8 })).toThrow(PixflowError);
  });

  it('rejects regions with non-finite or non-positive dimensions', () => {
    expect(() =>
      new PixelateFilter({ regions: [{ x: 0, y: 0, w: 0, h: 10 }], blockSize: 8 }),
    ).toThrow(PixflowError);
    expect(() =>
      new PixelateFilter({ regions: [{ x: 0, y: 0, w: 10, h: -1 }], blockSize: 8 }),
    ).toThrow(PixflowError);
    expect(() =>
      new PixelateFilter({
        regions: [{ x: Number.NaN, y: 0, w: 10, h: 10 }],
        blockSize: 8,
      }),
    ).toThrow(PixflowError);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter pixflow exec vitest run test/region-filters.test.ts`
Expected: FAIL with module-not-found on `../src/filters/pixelate.js`.

- [ ] **Step 3: Implement `PixelateFilter`**

```typescript
// packages/pixflow/src/filters/pixelate.ts
import { ErrorCode, PixflowError } from '../errors.js';
import { PIXELATE_WGSL } from '../shaders/pixelate.wgsl.js';
import { ComputeFilter, type ComputeFilterShape } from './compute-filter.js';

export interface Region {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface PixelateParams {
  readonly regions: readonly Region[];
  readonly blockSize: number;
}

export const MAX_REGIONS = 16;
const MIN_BLOCK_SIZE = 2;
const MAX_BLOCK_SIZE = 256;

// 4 × u32 header + MAX_REGIONS × vec4i (16 bytes each) = 16 + 256 = 272.
const HEADER_BYTES = 16;
const REGION_BYTES = 16;
const UNIFORM_BYTES = HEADER_BYTES + MAX_REGIONS * REGION_BYTES;

function validateRegion(r: Region, i: number): void {
  const finite =
    Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.w) && Number.isFinite(r.h);
  if (!finite) {
    throw new PixflowError(
      ErrorCode.INVALID_INPUT,
      `pixelate/regionBlur region ${i} has non-finite coordinates.`,
    );
  }
  if (r.w <= 0 || r.h <= 0) {
    throw new PixflowError(
      ErrorCode.INVALID_INPUT,
      `pixelate/regionBlur region ${i} must have positive width and height; got ${r.w}×${r.h}.`,
    );
  }
}

export function validateRegions(regions: readonly Region[]): void {
  if (regions.length > MAX_REGIONS) {
    throw new PixflowError(
      ErrorCode.INVALID_INPUT,
      `pixelate/regionBlur supports at most ${MAX_REGIONS} regions; got ${regions.length}.`,
    );
  }
  regions.forEach(validateRegion);
}

export function writeRegionsUniform(
  view: DataView,
  regions: readonly Region[],
  extra: (view: DataView) => void,
): void {
  // Header: region_count at offset 0, then filter-specific u32 at offset 4 (via extra()).
  view.setUint32(0, regions.length, true);
  extra(view);
  // Pads at 8, 12 left as 0.
  let off = HEADER_BYTES;
  for (const r of regions) {
    view.setInt32(off + 0, Math.round(r.x), true);
    view.setInt32(off + 4, Math.round(r.y), true);
    view.setInt32(off + 8, Math.round(r.w), true);
    view.setInt32(off + 12, Math.round(r.h), true);
    off += REGION_BYTES;
  }
}

function regionsHash(regions: readonly Region[]): string {
  return regions.map((r) => `${r.x}/${r.y}/${r.w}/${r.h}`).join(';');
}

const SHAPE: ComputeFilterShape<PixelateParams> = {
  name: 'pixelate',
  wgsl: PIXELATE_WGSL,
  entryPoint: 'main',
  uniformByteLength: UNIFORM_BYTES,
  writeUniforms(view, params): void {
    writeRegionsUniform(view, params.regions, (v) => {
      v.setUint32(4, Math.round(params.blockSize), true);
    });
  },
  hashSuffix(params) {
    return `bs=${params.blockSize}|r=${regionsHash(params.regions)}`;
  },
};

export class PixelateFilter extends ComputeFilter<PixelateParams> {
  protected readonly shape = SHAPE;

  constructor(params: PixelateParams) {
    if (
      !Number.isFinite(params.blockSize) ||
      !Number.isInteger(params.blockSize) ||
      params.blockSize < MIN_BLOCK_SIZE ||
      params.blockSize > MAX_BLOCK_SIZE
    ) {
      throw new PixflowError(
        ErrorCode.INVALID_INPUT,
        `pixelate.blockSize must be an integer in [${MIN_BLOCK_SIZE}, ${MAX_BLOCK_SIZE}]; got ${String(params.blockSize)}.`,
      );
    }
    validateRegions(params.regions);
    super('pixelate', params);
  }

  override get isIdentity(): boolean {
    return this.params.regions.length === 0;
  }

  outputSize(input: { width: number; height: number }): { width: number; height: number } {
    return { width: input.width, height: input.height };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter pixflow exec vitest run test/region-filters.test.ts`
Expected: PASS — 8 passing.

- [ ] **Step 5: Run the full pixflow test suite to confirm no regressions**

Run: `pnpm --filter pixflow exec vitest run`
Expected: PASS — all existing tests plus the 8 new ones.

- [ ] **Step 6: Commit**

```bash
git add packages/pixflow/src/filters/pixelate.ts packages/pixflow/test/region-filters.test.ts
git commit -m "feat(pixflow): add PixelateFilter"
```

---

## Task 3: `regionBlur` WGSL shader

**Files:**
- Create: `packages/pixflow/src/shaders/region-blur.wgsl.ts`

Region-gated 1D gaussian. Same shader runs twice: horizontal pass (direction = (1, 0)), then vertical pass (direction = (0, 1)) reading the intermediate texture. Inside any region → do the 1D blur sample loop. Outside → pass through `textureLoad(inputTex, coord, 0)`. The two-pass separability means the overall result equals a 2D gaussian **inside regions** and is an exact identity **outside regions** (because the horizontal pass writes original pixels there, and the vertical pass reads those originals unchanged).

MAX_RADIUS loop set to 96 to cover σ up to 32 (3σ tail). Loop bounds must be compile-time constants in WGSL (no dynamic loop limits over uniforms), so the runtime radius comes in via `params.radius` and the loop's `continue` statement skips out-of-range iterations — same pattern as `gaussian-blur.wgsl.ts`.

- [ ] **Step 1: Create the shader file**

```typescript
// packages/pixflow/src/shaders/region-blur.wgsl.ts
export const REGION_BLUR_WGSL = /* wgsl */ `
struct Params {
  region_count: u32,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
  direction: vec2f,
  radius: f32,
  inv_two_sigma_sq: f32,
  regions: array<vec4i, 16>,
}

@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var outputTex: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: Params;

const MAX_RADIUS: i32 = 96;

fn insideAnyRegion(x: i32, y: i32) -> bool {
  let n = i32(params.region_count);
  for (var i: i32 = 0; i < n; i = i + 1) {
    let r = params.regions[i];
    if (r.z <= 0 || r.w <= 0) { continue; }
    if (x >= r.x && y >= r.y && x < r.x + r.z && y < r.y + r.w) {
      return true;
    }
  }
  return false;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let dims = textureDimensions(outputTex);
  if (id.x >= dims.x || id.y >= dims.y) { return; }

  let coord = vec2i(i32(id.x), i32(id.y));

  if (!insideAnyRegion(coord.x, coord.y)) {
    textureStore(outputTex, coord, textureLoad(inputTex, coord, 0));
    return;
  }

  let in_dims = textureDimensions(inputTex);
  let max_x = i32(in_dims.x) - 1;
  let max_y = i32(in_dims.y) - 1;
  let r = i32(params.radius);
  let dir = vec2i(i32(params.direction.x), i32(params.direction.y));

  var sum = vec4f(0.0);
  var weight_sum = 0.0;
  for (var i: i32 = -MAX_RADIUS; i <= MAX_RADIUS; i = i + 1) {
    if (i < -r || i > r) { continue; }
    let fi = f32(i);
    let w = exp(-(fi * fi) * params.inv_two_sigma_sq);
    var sx = coord.x + dir.x * i;
    var sy = coord.y + dir.y * i;
    sx = clamp(sx, 0, max_x);
    sy = clamp(sy, 0, max_y);
    let s = textureLoad(inputTex, vec2i(sx, sy), 0);
    sum = sum + s * w;
    weight_sum = weight_sum + w;
  }
  textureStore(outputTex, coord, sum / weight_sum);
}
`;
```

- [ ] **Step 2: Commit**

```bash
git add packages/pixflow/src/shaders/region-blur.wgsl.ts
git commit -m "feat(pixflow): add region-blur WGSL shader"
```

---

## Task 4: `RegionBlurFilter`

**Files:**
- Create: `packages/pixflow/src/filters/region-blur.ts`
- Modify: `packages/pixflow/test/region-filters.test.ts` (append `describe('RegionBlurFilter', …)`)

Unlike `PixelateFilter`, this one needs two compute-pass invocations per `execute()` with different `direction` uniforms. The `ComputeFilter<Params>` base cannot express that, so we follow `GaussianBlurFilter`'s approach: own the bind-group layout, own both uniform buffers, orchestrate pipelineCache lookup manually, borrow one intermediate texture from the pool. Regions data is identical across both passes — we still write it into both uniform buffers (cheap) so the same shader uses a single uniform struct layout.

Uniform layout: 16-byte header (region_count + 3 pads) + 16-byte pass-params (direction vec2f + radius f32 + invTwoSigmaSq f32) + 256 bytes regions array = 288 bytes.

- [ ] **Step 1: Append failing tests for `RegionBlurFilter` to region-filters.test.ts**

```typescript
// Append at the end of packages/pixflow/test/region-filters.test.ts

import { RegionBlurFilter } from '../src/filters/region-blur.js';

describe('RegionBlurFilter', () => {
  it('stores params and exposes name/stage', () => {
    const f = new RegionBlurFilter({ regions: [R], sigma: 4 });
    expect(f.name).toBe('regionBlur');
    expect(f.stage).toBe('compute');
    expect(f.params.sigma).toBe(4);
  });

  it('produces a deterministic hash for identical params', () => {
    const a = new RegionBlurFilter({ regions: [R], sigma: 4 });
    const b = new RegionBlurFilter({ regions: [R], sigma: 4 });
    expect(a.hash()).toBe(b.hash());
  });

  it('produces different hashes when sigma or regions differ', () => {
    const base = new RegionBlurFilter({ regions: [R], sigma: 4 });
    const bySigma = new RegionBlurFilter({ regions: [R], sigma: 5 });
    const byRegion = new RegionBlurFilter({ regions: [{ ...R, x: 11 }], sigma: 4 });
    expect(base.hash()).not.toBe(bySigma.hash());
    expect(base.hash()).not.toBe(byRegion.hash());
  });

  it('has a hash distinct from PixelateFilter even with overlapping fields', () => {
    const p = new PixelateFilter({ regions: [R], blockSize: 8 });
    const b = new RegionBlurFilter({ regions: [R], sigma: 4 });
    expect(p.hash()).not.toBe(b.hash());
  });

  it('is identity when regions are empty', () => {
    const f = new RegionBlurFilter({ regions: [], sigma: 4 });
    expect(f.isIdentity).toBe(true);
  });

  it('preserves output dimensions', () => {
    const f = new RegionBlurFilter({ regions: [R], sigma: 4 });
    expect(f.outputSize?.({ width: 640, height: 480 })).toEqual({
      width: 640,
      height: 480,
    });
  });

  it('rejects sigma outside (0, 32]', () => {
    expect(() => new RegionBlurFilter({ regions: [R], sigma: 0 })).toThrow(PixflowError);
    expect(() => new RegionBlurFilter({ regions: [R], sigma: -1 })).toThrow(PixflowError);
    expect(() => new RegionBlurFilter({ regions: [R], sigma: 33 })).toThrow(PixflowError);
    expect(() => new RegionBlurFilter({ regions: [R], sigma: Number.NaN })).toThrow(PixflowError);
  });

  it('rejects more than 16 regions', () => {
    const many = Array.from({ length: 17 }, (_, i) => ({ x: i, y: 0, w: 5, h: 5 }));
    expect(() => new RegionBlurFilter({ regions: many, sigma: 4 })).toThrow(PixflowError);
  });

  it('rejects regions with non-positive dimensions', () => {
    expect(() =>
      new RegionBlurFilter({ regions: [{ x: 0, y: 0, w: 10, h: 0 }], sigma: 4 }),
    ).toThrow(PixflowError);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter pixflow exec vitest run test/region-filters.test.ts`
Expected: FAIL — module `../src/filters/region-blur.js` not found.

- [ ] **Step 3: Implement `RegionBlurFilter`**

```typescript
// packages/pixflow/src/filters/region-blur.ts
import { ErrorCode, PixflowError } from '../errors.js';
import { REGION_BLUR_WGSL } from '../shaders/region-blur.wgsl.js';
import type { Dims, ExecutionContext, Filter } from '../types.js';
import { WORKGROUP_SIZE, alignTo } from './compute-filter.js';
import {
  MAX_REGIONS,
  type Region,
  validateRegions,
  writeRegionsUniform,
} from './pixelate.js';

export interface RegionBlurParams {
  readonly regions: readonly Region[];
  readonly sigma: number;
}

const MAX_SIGMA = 32;
// 16 header + 16 pass-params + MAX_REGIONS × 16 = 288 (already 16-byte aligned).
const UNIFORM_BYTES = 16 + 16 + MAX_REGIONS * 16;

interface PreparedPass {
  readonly pipeline: GPUComputePipeline;
  readonly bindGroupLayout: GPUBindGroupLayout;
  readonly uniformBuffer: GPUBuffer;
}

export class RegionBlurFilter implements Filter<RegionBlurParams> {
  readonly name = 'regionBlur';
  readonly stage = 'compute' as const;
  readonly params: RegionBlurParams;

  private horizontal: PreparedPass | null = null;
  private vertical: PreparedPass | null = null;
  private cachedLayout: GPUBindGroupLayout | null = null;

  get isIdentity(): boolean {
    return this.params.regions.length === 0;
  }

  constructor(params: RegionBlurParams) {
    if (
      !Number.isFinite(params.sigma) ||
      params.sigma <= 0 ||
      params.sigma > MAX_SIGMA
    ) {
      throw new PixflowError(
        ErrorCode.INVALID_INPUT,
        `regionBlur.sigma must be a finite number in (0, ${MAX_SIGMA}]; got ${String(params.sigma)}.`,
      );
    }
    validateRegions(params.regions);
    this.params = params;
  }

  hash(): string {
    const rs = this.params.regions.map((r) => `${r.x}/${r.y}/${r.w}/${r.h}`).join(';');
    return `regionBlur|sigma=${this.params.sigma.toFixed(4)}|r=${rs}`;
  }

  outputSize(input: Dims): Dims {
    return { width: input.width, height: input.height };
  }

  dispose(): void {
    this.horizontal?.uniformBuffer.destroy();
    this.vertical?.uniformBuffer.destroy();
    this.horizontal = null;
    this.vertical = null;
    this.cachedLayout = null;
  }

  async prepare(ctx: ExecutionContext, _input: Dims, _output: Dims): Promise<void> {
    const sigma = this.params.sigma;
    const invTwoSigmaSq = 1 / (2 * sigma * sigma);
    const radius = Math.min(Math.ceil(sigma * 3), 96);
    const cacheKey = `regionBlur|${ctx.textureFormat}`;

    if (!this.cachedLayout) {
      this.cachedLayout = this.bindGroupLayout(ctx);
    }
    const layout = this.cachedLayout;
    const pipeline = ctx.pipelineCache.getOrCreate(cacheKey, () =>
      this.createPipeline(ctx, layout),
    );

    this.horizontal = this.makePass(
      ctx,
      pipeline,
      layout,
      1,
      0,
      radius,
      invTwoSigmaSq,
      this.horizontal?.uniformBuffer,
    );
    this.vertical = this.makePass(
      ctx,
      pipeline,
      layout,
      0,
      1,
      radius,
      invTwoSigmaSq,
      this.vertical?.uniformBuffer,
    );
  }

  execute(input: GPUTexture, output: GPUTexture, ctx: ExecutionContext): void {
    if (!this.horizontal || !this.vertical) {
      throw new PixflowError(
        ErrorCode.INTERNAL,
        'RegionBlurFilter executed before prepare() completed.',
      );
    }
    const intermediate = ctx.texturePool.acquire(
      input.width,
      input.height,
      ctx.textureFormat,
    );
    this.runPass(this.horizontal, input, intermediate, ctx);
    this.runPass(this.vertical, intermediate, output, ctx);
    ctx.texturePool.release(intermediate);
  }

  private runPass(
    pass: PreparedPass,
    input: GPUTexture,
    output: GPUTexture,
    ctx: ExecutionContext,
  ): void {
    const bg = ctx.device.createBindGroup({
      label: 'pixflow.regionBlur.bg',
      layout: pass.bindGroupLayout,
      entries: [
        { binding: 0, resource: input.createView() },
        { binding: 1, resource: output.createView() },
        { binding: 2, resource: { buffer: pass.uniformBuffer } },
      ],
    });
    const enc = ctx.encoder.beginComputePass({ label: 'pixflow.regionBlur.pass' });
    enc.setPipeline(pass.pipeline);
    enc.setBindGroup(0, bg);
    enc.dispatchWorkgroups(
      Math.ceil(output.width / WORKGROUP_SIZE),
      Math.ceil(output.height / WORKGROUP_SIZE),
      1,
    );
    enc.end();
  }

  private makePass(
    ctx: ExecutionContext,
    pipeline: GPUComputePipeline,
    layout: GPUBindGroupLayout,
    dirX: number,
    dirY: number,
    radius: number,
    invTwoSigmaSq: number,
    existing: GPUBuffer | undefined,
  ): PreparedPass {
    const size = alignTo(UNIFORM_BYTES, 16);
    const buf =
      existing && existing.size >= size
        ? existing
        : ctx.device.createBuffer({
            label: 'pixflow.regionBlur.uniforms',
            size,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
          });
    if (existing && existing !== buf) existing.destroy();

    const bytes = new ArrayBuffer(size);
    const view = new DataView(bytes);
    // Header (16 bytes): region_count at offset 0, pads at 4/8/12.
    writeRegionsUniform(view, this.params.regions, () => {
      /* no extra header field; pixelate uses this for blockSize */
    });
    // Pass-params (16 bytes) at offset 16: direction.xy (f32, f32), radius f32, invTwoSigmaSq f32.
    view.setFloat32(16, dirX, true);
    view.setFloat32(20, dirY, true);
    view.setFloat32(24, radius, true);
    view.setFloat32(28, invTwoSigmaSq, true);
    // Region array at offset 32 — but writeRegionsUniform wrote them at offset 16 (HEADER_BYTES).
    // We need to rewrite them at offset 32 so the WGSL struct layout matches.
    // Simpler: rewrite the region block at the correct offset directly.
    let off = 32;
    for (const r of this.params.regions) {
      view.setInt32(off + 0, Math.round(r.x), true);
      view.setInt32(off + 4, Math.round(r.y), true);
      view.setInt32(off + 8, Math.round(r.w), true);
      view.setInt32(off + 12, Math.round(r.h), true);
      off += 16;
    }
    ctx.queue.writeBuffer(buf, 0, bytes);
    return { pipeline, bindGroupLayout: layout, uniformBuffer: buf };
  }

  private createPipeline(ctx: ExecutionContext, layout: GPUBindGroupLayout): GPUComputePipeline {
    const module = ctx.device.createShaderModule({
      label: 'pixflow.regionBlur.module',
      code: REGION_BLUR_WGSL,
    });
    return ctx.device.createComputePipeline({
      label: 'pixflow.regionBlur.pipeline',
      layout: ctx.device.createPipelineLayout({ bindGroupLayouts: [layout] }),
      compute: { module, entryPoint: 'main' },
    });
  }

  private bindGroupLayout(ctx: ExecutionContext): GPUBindGroupLayout {
    return ctx.device.createBindGroupLayout({
      label: 'pixflow.regionBlur.bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          texture: { sampleType: 'float', viewDimension: '2d', multisampled: false },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: {
            access: 'write-only',
            format: ctx.textureFormat,
            viewDimension: '2d',
          },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'uniform' },
        },
      ],
    });
  }
}
```

**Note on uniform layout:** WGSL lays out `Params` as { 16-byte header: `region_count` + 3 pads } + { 16-byte pass-params: `direction.xy` + `radius` + `invTwoSigmaSq` } + `regions: array<vec4i, 16>` starting at offset 32. `pixelate.ts` shares the `writeRegionsUniform` helper but its own struct lays regions at offset 16 (no pass-params block). Task 4 re-writes the region bytes at the correct regionBlur offset (32) after using `writeRegionsUniform` for the header. A cleaner factoring is possible but not worth the extra code surface for two call sites — this PR's YAGNI tradeoff.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter pixflow exec vitest run test/region-filters.test.ts`
Expected: PASS — all 17 tests (8 from PixelateFilter + 9 from RegionBlurFilter).

- [ ] **Step 5: Run the full pixflow test suite**

Run: `pnpm --filter pixflow exec vitest run`
Expected: PASS — pre-existing 130 + 17 new = 147.

- [ ] **Step 6: Commit**

```bash
git add packages/pixflow/src/filters/region-blur.ts packages/pixflow/test/region-filters.test.ts
git commit -m "feat(pixflow): add RegionBlurFilter"
```

---

## Task 5: Export filters from barrel + add Pipeline methods

**Files:**
- Modify: `packages/pixflow/src/filters/index.ts`
- Modify: `packages/pixflow/src/pipeline/pipeline.ts`

- [ ] **Step 1: Add filter exports to the barrel**

Open `packages/pixflow/src/filters/index.ts` and append **before** the `ComputeFilter` line (line 34):

```typescript
export {
  PixelateFilter,
  MAX_REGIONS,
  type Region,
  type PixelateParams,
} from './pixelate.js';
export { RegionBlurFilter, type RegionBlurParams } from './region-blur.js';
```

Final file tail should look like:

```typescript
// ... existing exports ...
export {
  PixelateFilter,
  MAX_REGIONS,
  type Region,
  type PixelateParams,
} from './pixelate.js';
export { RegionBlurFilter, type RegionBlurParams } from './region-blur.js';
export { ComputeFilter, WORKGROUP_SIZE, alignTo } from './compute-filter.js';
export type { ComputeFilterShape } from './compute-filter.js';
```

- [ ] **Step 2: Add the filter imports to `pipeline.ts`**

Open `packages/pixflow/src/pipeline/pipeline.ts`. After the existing filter imports (around line 18, right after the `WhiteBalanceFilter` import), add:

```typescript
import { PixelateFilter, type PixelateParams } from '../filters/pixelate.js';
import { RegionBlurFilter, type RegionBlurParams } from '../filters/region-blur.js';
```

- [ ] **Step 3: Add the `.pixelate()` and `.regionBlur()` methods**

In `pipeline.ts`, locate the `.watermark(params)` method (around line 200). Insert immediately after its closing brace:

```typescript
  /**
   * Replace pixels inside each region with a mosaic of `blockSize × blockSize`
   * blocks. Outside regions are untouched. Regions are in the input-texture's
   * pixel coordinate space at the point this filter runs in the chain — if
   * you resize or crop first, remap regions yourself.
   */
  pixelate(params: PixelateParams): this {
    this.filters.push(new PixelateFilter(params));
    return this;
  }

  /**
   * Apply a 2D gaussian blur (σ in pixels) restricted to the given regions.
   * Pixels outside regions are passed through unchanged. Same coordinate-space
   * rules as `pixelate()`.
   */
  regionBlur(params: RegionBlurParams): this {
    this.filters.push(new RegionBlurFilter(params));
    return this;
  }
```

- [ ] **Step 4: Write a smoke test that confirms Pipeline chaining wires the filters**

Append to `packages/pixflow/test/region-filters.test.ts`:

```typescript
import { Pipeline } from '../src/pipeline/pipeline.js';

describe('Pipeline chaining', () => {
  it('pixelate() is chainable and adds a PixelateFilter instance', () => {
    const p = Pipeline.create({});
    const returned = p.pixelate({ regions: [R], blockSize: 8 });
    expect(returned).toBe(p);
  });

  it('regionBlur() is chainable and adds a RegionBlurFilter instance', () => {
    const p = Pipeline.create({});
    const returned = p.regionBlur({ regions: [R], sigma: 4 });
    expect(returned).toBe(p);
  });

  it('invalid params throw through the chain', () => {
    const p = Pipeline.create({});
    expect(() => p.pixelate({ regions: [R], blockSize: 1 })).toThrow(PixflowError);
    expect(() => p.regionBlur({ regions: [R], sigma: 0 })).toThrow(PixflowError);
  });
});
```

- [ ] **Step 5: Run the full pixflow test suite**

Run: `pnpm --filter pixflow exec vitest run`
Expected: PASS — 130 pre-existing + 17 filter tests + 3 chaining tests = 150.

- [ ] **Step 6: Typecheck the pixflow package**

Run: `pnpm --filter pixflow exec tsc --noEmit`
Expected: PASS — no errors. (If `exactOptionalPropertyTypes` flags the `undefined` buffer in `makePass`, adjust the parameter type to `GPUBuffer | undefined`.)

- [ ] **Step 7: Commit**

```bash
git add packages/pixflow/src/filters/index.ts packages/pixflow/src/pipeline/pipeline.ts packages/pixflow/test/region-filters.test.ts
git commit -m "feat(pixflow): expose pixelate/regionBlur via Pipeline"
```

---

## Task 6: Browser smoke in vanilla-js demo

**Files:**
- Modify: `examples/vanilla-js/main.ts` (add two debug buttons)
- Modify: `examples/vanilla-js/index.html` (add buttons — read file first to locate the controls section)

Mock-based unit tests cannot catch WGSL compile errors (PR #7 bit us on `vec2i(u32,u32)` and `RENDER_ATTACHMENT` — both shipped through 130 passing tests). This task adds a minimal browser smoke path: two buttons that apply the new filters to a hardcoded centered region on the currently loaded image. It stays in the demo as a "debug" strip — harmless, tiny, and proves WGSL actually compiles on Chromium/Firefox Tint.

- [ ] **Step 1: Read `examples/vanilla-js/index.html` to find where the existing filter controls live**

```bash
cat examples/vanilla-js/index.html | head -80
```

Locate a controls/toolbar block near the existing brightness/contrast or watermark controls.

- [ ] **Step 2: Add two buttons to `index.html`**

Add near the existing filter controls (adapt the class names to whatever the demo already uses for buttons — don't invent new styling tokens):

```html
<div class="demo-debug-row">
  <button id="smoke-pixelate" type="button">Pixelate center</button>
  <button id="smoke-region-blur" type="button">Region blur center</button>
</div>
```

- [ ] **Step 3: Wire the buttons in `main.ts`**

Open `examples/vanilla-js/main.ts`. Find the point where the loaded `ImageBitmap` is held in a module-scoped variable (e.g. `currentBitmap` or similar — grep for `ImageBitmap` near the top). Add, adjacent to the other button handlers:

```typescript
import { Pipeline } from 'pixflow';

function centerRegion(bitmap: ImageBitmap): { x: number; y: number; w: number; h: number } {
  const w = Math.round(bitmap.width * 0.4);
  const h = Math.round(bitmap.height * 0.4);
  return {
    x: Math.round((bitmap.width - w) / 2),
    y: Math.round((bitmap.height - h) / 2),
    w,
    h,
  };
}

document.getElementById('smoke-pixelate')?.addEventListener('click', async () => {
  // Replace `currentBitmap` with whatever the demo stores the loaded bitmap in.
  if (!currentBitmap) return;
  const r = centerRegion(currentBitmap);
  const result = await Pipeline.create({})
    .pixelate({ regions: [r], blockSize: 24 })
    .encode({ format: 'image/png', quality: 1 })
    .run(currentBitmap);
  // Reuse the demo's existing blob-display function — e.g. showResult(result.blob).
  showResult(result.blob);
});

document.getElementById('smoke-region-blur')?.addEventListener('click', async () => {
  if (!currentBitmap) return;
  const r = centerRegion(currentBitmap);
  const result = await Pipeline.create({})
    .regionBlur({ regions: [r], sigma: 12 })
    .encode({ format: 'image/png', quality: 1 })
    .run(currentBitmap);
  showResult(result.blob);
});
```

**Adapt the identifiers** (`currentBitmap`, `showResult`) to whatever the demo's `main.ts` actually uses — don't fabricate names. If those helpers don't exist, run the filters against a freshly loaded `<input type=file>` bitmap and write the result to a `<canvas>` by calling `createImageBitmap(result.blob)` then `ctx.drawImage`.

- [ ] **Step 4: Start the demo and smoke-test**

Run (in one terminal): `pnpm --filter @pixflow/examples-vanilla-js exec vite` (or whatever script name the demo uses — check its `package.json`).

Open the URL it prints. Load any JPEG. Click **Pixelate center** → confirm the center ~40% of the image becomes a coarse mosaic. Click **Region blur center** → confirm the center blurs while the surround stays sharp. Open devtools console — there must be **zero** WGSL/WebGPU validation errors.

- [ ] **Step 5: If either button errors, fix the root cause before committing**

Typical failure modes:
  - `[Invalid ShaderModule pixflow.<name>.module]` → WGSL compile error. Copy the error text, find the offending line in the shader file, fix the type or cast.
  - `[Invalid BindGroup]` → uniform buffer layout mismatch. Confirm byte offsets in the TypeScript writer match the WGSL `struct` field order.
  - No error but visible output is wrong → likely a coordinate-space bug in the shader's region hit-test.

Do **not** skip this step. The whole point of this task is to catch what the mock tests miss.

- [ ] **Step 6: Commit**

```bash
git add examples/vanilla-js/main.ts examples/vanilla-js/index.html
git commit -m "chore(examples): add pixelate + regionBlur smoke buttons"
```

---

## Task 7: Wrap up

- [ ] **Step 1: Run the full workspace test suite one last time**

Run: `pnpm -r exec vitest run` (or the workspace's root test script).
Expected: PASS — pixflow tests now total 150 (130 → 150, +20 from this PR), editor tests unchanged at 104.

- [ ] **Step 2: Final typecheck across the workspace**

Run: `pnpm -r exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Check bundle size for pixflow**

Run: `pnpm --filter pixflow build`
Expected: Successful build. Note the new size — two shaders + two filter classes should add ~2–3 KB gzipped to the pixflow bundle.

- [ ] **Step 4: Follow the `superpowers:finishing-a-development-branch` skill**

Skill tells you exactly what to do: tests-pass check (already done), then present the 4-option menu (merge locally / push PR / keep / discard).

---

## Self-Review

**1. Spec coverage** (spec §5 "ML — face blur" and §7 PR #8):
- `Pipeline.pixelate({ regions, blockSize })` — covered by Task 5.
- `Pipeline.regionBlur({ regions, sigma })` — covered by Task 5.
- "Added to pixflow's public API" — covered by Task 5 Step 1 (barrel export).
- PR #8 is listed as "blocked by #3 (parallel)" — no editor changes, matches this plan's scope.

**2. Placeholder scan:** No "TBD", "handle edge cases", or empty code blocks. Task 6 explicitly flags two identifier names (`currentBitmap`, `showResult`) as needing to match the demo's actual names — that's a concrete instruction, not a placeholder.

**3. Type consistency:**
- `Region` defined in `pixelate.ts`, re-imported by `region-blur.ts`, re-exported from barrel — same name everywhere.
- `validateRegions` / `writeRegionsUniform` defined in `pixelate.ts` (Task 2), used in `region-blur.ts` (Task 4) — consistent.
- `PixelateParams.blockSize` (integer) vs `RegionBlurParams.sigma` (float) — distinct names so there's no confusion.
- `MAX_REGIONS = 16` constant exported from pixelate.ts; barrel re-exports it; WGSL shaders hardcode `array<vec4i, 16>` — three places, same number. **Caveat:** if MAX_REGIONS ever changes, both shaders need manual updates. Acceptable for now (YAGNI) but note for future refactor.

**4. Risk notes:**
- The two uniform layouts differ (pixelate has a `blockSize` in the header slot, regionBlur has a pass-params block between header and regions). Task 4 has a prose note explaining this; the code path rewrites region bytes at the correct offset. If this trips a future reader, consider factoring into per-filter uniform-writer functions.
- WGSL loop cap `MAX_RADIUS = 96` must stay ≥ `ceil(MAX_SIGMA * 3)`. Task 3's shader uses 96 and Task 4's constructor caps sigma at 32 — 32 × 3 = 96. Consistent.
