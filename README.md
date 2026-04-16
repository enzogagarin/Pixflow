# pixflow

WebGPU-based browser image processing library.

> **Status: Week 1-2 prototype.** Not published. APIs are unstable.
>
> See [`DESIGN.md`](./DESIGN.md) for the full specification, 12-week roadmap, and path to v1.0.

## What works today

- WebGPU feature detection and device acquisition (`isWebGPUSupported`, `acquireDevice`)
- Image import: `File` / `Blob` / URL / `ImageBitmap` → `GPUTexture`
- Texture → Canvas → Blob readback (PNG/JPEG/WebP via `convertToBlob`)
- Two compute-shader filters: `brightness` and `contrast`
- `Pipeline.create().brightness(0.2).contrast(0.1).run(file)` builder API
- Ping-pong intermediate textures (two allocations regardless of filter count)
- Structured errors: `PixflowError` with stable `code` values (`ErrorCode`)

## Not yet implemented

Everything else from `DESIGN.md`: Lanczos resize, the rest of the color filters, gaussian blur,
unsharp mask, crop/rotate/flip/pad, EXIF orient, batch API, resource pool, pipeline cache,
WebGL2 fallback, React bindings, CLI, WebCodecs AVIF, demo site, docs.

## Quick start (local)

```bash
pnpm install
pnpm dev        # boots the demo at http://localhost:5173
pnpm typecheck  # strict TypeScript check
pnpm test       # headless unit tests (Vitest)
pnpm build      # library build via tsup
```

Open the demo, upload an image, adjust the brightness slider (defaults to +20),
click **Apply pipeline**, then **Download result**.

## Example usage

```ts
import { Pipeline } from 'pixflow';

const result = await Pipeline.create()
  .brightness(0.2)
  .contrast(0.1)
  .run(file, { format: 'image/png' });

// result: { blob, width, height, stats }
```

## License

MIT — see [`LICENSE`](./LICENSE).
