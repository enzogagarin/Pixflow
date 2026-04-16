# pixflow

**WebGPU image pipelines, in the browser.**
Resize, sharpen, color-correct, encode — all on the GPU, all client-side, no servers, no uploads.

```ts
import { Pipeline } from 'pixflow';

const result = await Pipeline.create()
  .orient()
  .resize({ width: 1200, fit: 'inside', withoutEnlargement: true })
  .unsharpMask({ amount: 0.3, radius: 1 })
  .encode({ format: 'image/webp', quality: 0.82 })
  .run(file);

// result: { blob, width, height, format, stats }
```

That's it. Drop in a `File`, get back a `Blob`. The image never leaves the device.

---

## Why pixflow

Image processing on the web today usually means one of two things: ship megabytes to a backend
service, or accept the slow, single-threaded reality of Canvas2D. Neither is great.

WebGPU changes the math. A modern integrated GPU has 50–500 GFLOPS of compute sitting idle
while your page waits on the JPEG encoder. pixflow is a thin, fluent library that turns
that idle silicon into a working image pipeline — with the same API surface you'd expect from
a node-side tool like sharp.

- **Fast.** Lanczos-3 resize, separable gaussian blur, unsharp mask — all compute shaders.
  Typical speedups vs Canvas2D: **5–20× on integrated GPUs, 30×+ on dGPUs.**
- **Lossless by default.** PNG out unless you ask for otherwise. Quality is opt-in.
- **Private.** Nothing leaves the browser. No telemetry. No analytics. No CDN call-home.
- **Tiny.** ~70 KB minified, no dependencies, tree-shakable.
- **Correct.** EXIF orientation, color space-safe color filters, deterministic output sizes.

---

## Install

```bash
npm install pixflow
# or
pnpm add pixflow
```

Requires a browser with WebGPU (Chrome 113+, Edge 113+, Safari 18+, Firefox 141+ behind flag).
There is no Node build — pixflow is browser-only by design.

---

## Quick start

```ts
import { Pipeline, isWebGPUSupported } from 'pixflow';

if (!(await isWebGPUSupported())) {
  // Show a fallback UI; pixflow will not load on this device.
  return;
}

// One image, one pipeline:
const out = await Pipeline.create()
  .resize({ width: 1600, height: 900, fit: 'cover' })
  .saturation(0.1)
  .unsharpMask({ amount: 0.25 })
  .encode({ format: 'image/webp', quality: 0.85 })
  .run(file);

// 100 images, four-at-a-time:
const results = await Pipeline.create()
  .orient()
  .resize({ width: 1200, fit: 'inside' })
  .encode({ format: 'image/webp', quality: 0.82 })
  .batch(files, {
    concurrency: 4,
    onProgress: (i, total) => console.log(`${i}/${total}`),
    signal: abortController.signal,
  });
```

### Built-in presets

```ts
import { Pipeline, getPreset } from 'pixflow';

const result = await getPreset('forum-post')
  .apply(Pipeline.create())
  .run(file);
```

| Preset | What it does |
| --- | --- |
| `forum-post` | Auto-orient → 1200px max → mild sharpen → WebP Q82 |
| `ecommerce-thumbnail` | 600×600 cover crop → sharpen → AVIF Q70 (WebP fallback) |
| `blog-hero` | 1600×900 cover → +10% saturation → sharpen → WebP Q85 |
| `avatar` | 256×256 cover → mild sharpen → WebP Q80 |

---

## Benchmarks

Measured on a single 4032×3024 JPEG, pipeline = `resize(1200) + unsharpMask + encode(webp Q82)`.
The included demo (`examples/vanilla-js/`) runs the same comparison live in your browser
so you can see your own numbers.

| Hardware | pixflow (WebGPU) | Canvas2D | Speedup |
| --- | --- | --- | --- |
| M2 Pro (integrated) | ~38 ms | ~640 ms | **17×** |
| Ryzen 7 / RTX 3060 | ~21 ms | ~590 ms | **28×** |
| Intel Iris Xe (laptop) | ~110 ms | ~810 ms | **7×** |

Numbers above include readback + encode. The compute portion alone is typically 2–4 ms.

---

## API

### Pipeline

`Pipeline` is a fluent builder. Each call returns a new `Pipeline`, so it's safe to fork:

```ts
const base = Pipeline.create().orient().resize({ width: 1200, fit: 'inside' });
const webp = base.encode({ format: 'image/webp', quality: 0.82 });
const png  = base.encode({ format: 'image/png' });
```

#### Color

- `.brightness(amount)` — shift in [-1, 1]
- `.contrast(amount)` — slope in [-1, 1]
- `.saturation(amount)` — multiplier offset in [-1, 1]
- `.curves(points)` — piecewise linear tone curve, e.g. `[[0,0], [0.5,0.6], [1,1]]`
- `.whiteBalance({ temperature, tint })` — both in [-1, 1]
- `.colorMatrix(matrix4x4, bias?)` — full 4×4 color transform; helpers
  `IDENTITY_MATRIX`, `GRAYSCALE_MATRIX`, `SEPIA_MATRIX` ship in the box

#### Geometry

- `.resize({ width?, height?, fit, withoutEnlargement? })` — Lanczos-3, fits `inside` / `cover` / `fill`
- `.crop({ x, y, width, height })`
- `.rotate90(turns)` — `1`, `2`, or `3` quarter turns
- `.flip('horizontal' | 'vertical')`
- `.pad({ top, right, bottom, left, color })`
- `.orient()` — apply EXIF orientation in one call

#### Effects

- `.gaussianBlur({ sigma })` — separable two-pass
- `.unsharpMask({ amount, radius?, threshold? })`

#### Output

- `.encode({ format, quality? })` — `image/png` (default), `image/jpeg`, `image/webp`, `image/avif`
  (AVIF auto-falls back to WebP when unsupported and reports it on `result.fallback`)
- `.run(source, opts?)` — execute on a single `File`/`Blob`/URL/`ImageBitmap`
- `.batch(sources, { concurrency, signal, onProgress, onItemError })` — parallel batch with cancellation

### Errors

All failures throw `PixflowError` with a stable `code` from `ErrorCode`
(`UNSUPPORTED_BROWSER`, `DEVICE_LOST`, `INVALID_PARAMS`, `DECODE_FAILED`, `ABORTED`, …).
Match on `code`, not on message.

### Resource hints

For long-running apps that process many images, share a `TexturePool` and `PipelineCache`:

```ts
import { Pipeline, TexturePool, PipelineCache, acquireDevice } from 'pixflow';

const { device } = await acquireDevice();
const pool = new TexturePool(device);
const cache = new PipelineCache(device);

await Pipeline.create()
  .resize({ width: 1200, fit: 'inside' })
  .batch(files, { device, pool, cache, concurrency: 4 });
```

---

## Browser support

| Browser | Status |
| --- | --- |
| Chrome / Edge 113+ | Stable |
| Safari 18+ | Stable |
| Firefox 141+ | Behind `dom.webgpu.enabled` flag |
| Older / mobile fallback | Not yet — feature-detect with `isWebGPUSupported()` and degrade |

A WebGL2 fallback is on the roadmap (`DESIGN.md`, week 11) for the long tail.

---

## Develop locally

```bash
git clone https://github.com/buraks/pixflow
cd pixflow
pnpm install
pnpm dev          # demo at http://localhost:5173
pnpm test         # 120 unit tests, headless
pnpm typecheck    # strict TS
pnpm build        # library bundle via tsup → dist/
```

The demo in `examples/vanilla-js/` is the best place to see what the library can do —
drop in 100 images, pick a preset, watch the live Canvas2D-vs-pixflow benchmark.

---

## License

MIT — see [`LICENSE`](./LICENSE).
