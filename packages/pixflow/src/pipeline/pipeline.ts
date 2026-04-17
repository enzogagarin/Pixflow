import { acquireDevice, trackDevice, type TrackedDevice } from '../backends/webgpu/device.js';
import { textureToBlob, type ReadbackOptions } from '../codec/readback.js';
import { ErrorCode, PixflowError } from '../errors.js';
import { AutoOrientFilter } from '../filters/auto-orient.js';
import { BrightnessFilter, type BrightnessParams } from '../filters/brightness.js';
import { ColorMatrixFilter, type ColorMatrixParams } from '../filters/color-matrix.js';
import { ContrastFilter, type ContrastParams } from '../filters/contrast.js';
import { CropFilter, type CropParams } from '../filters/crop.js';
import { CurvesFilter, type CurvesParams, type CurvePoint } from '../filters/curves.js';
import { FlipFilter, type FlipParams, type FlipAxis } from '../filters/flip.js';
import { GaussianBlurFilter, type GaussianBlurParams } from '../filters/gaussian-blur.js';
import { PadFilter, type PadParams } from '../filters/pad.js';
import { ResizeFilter, type ResizeParams } from '../filters/resize.js';
import { Rotate90Filter, type Rotate90Params } from '../filters/rotate90.js';
import { SaturationFilter, type SaturationParams } from '../filters/saturation.js';
import { UnsharpMaskFilter, type UnsharpMaskParams } from '../filters/unsharp-mask.js';
import { WatermarkFilter, type WatermarkParams } from '../filters/watermark.js';
import { WhiteBalanceFilter, type WhiteBalanceParams } from '../filters/white-balance.js';
import { PixelateFilter, type PixelateParams } from '../filters/pixelate.js';
import { RegionBlurFilter, type RegionBlurParams } from '../filters/region-blur.js';
import { getPreset, type PresetName } from '../presets.js';
import { imageToTexture, sourceToImageBitmap } from '../resources/image-import.js';
import { TexturePool } from '../resources/texture-pool.js';
import { isExifOrientation, orientFilters, readExifOrientation } from '../utils/exif.js';
import type {
  Dims,
  EncodeOptions,
  ExecutionContext,
  Filter,
  ImageSource,
  PipelineResult,
} from '../types.js';
import { PipelineCache } from './pipeline-cache.js';

export type LogLevel = 'silent' | 'warn' | 'debug';

export interface PipelineOptions {
  readonly device?: GPUDevice;
  readonly textureFormat?: GPUTextureFormat;
  /** Cap pooled GPU memory (default 256 MB). Forwarded to the TexturePool. */
  readonly maxMemoryMB?: number;
  /** Bound on the pipeline cache size; LRU beyond this. Default 64. */
  readonly maxCacheEntries?: number;
  /** 'silent' (default), 'warn', or 'debug'. Controls console logging. */
  readonly logLevel?: LogLevel;
}

export interface RunOptions extends EncodeOptions {
  readonly canvas?: HTMLCanvasElement | OffscreenCanvas;
}

export interface BatchOptions extends RunOptions {
  /**
   * Maximum number of images processed in parallel. WebGPU submissions are
   * already serialized on the device queue, but overlapping decode + readback
   * with GPU work is where parallelism wins. Default: 4.
   */
  readonly concurrency?: number;
  /**
   * Fired after each image finishes (successfully). `done` is monotonic.
   * `result` and `index` let UI code route the output to the right slot
   * without waiting for the whole batch to resolve.
   */
  readonly onProgress?: (done: number, total: number, result: PipelineResult, index: number) => void;
  /** Abort the in-progress batch. Already-completed results are preserved. */
  readonly signal?: AbortSignal;
}

const DEFAULT_FORMAT: GPUTextureFormat = 'rgba8unorm';
const DEFAULT_CONCURRENCY = 4;

export class Pipeline {
  private filters: Filter[] = [];
  private readonly options: PipelineOptions;
  private readonly pipelineCache: PipelineCache;
  private texturePool: TexturePool | null = null;
  private ownedDevice: GPUDevice | null = null;
  // Single-flight latch for concurrent acquireDevice() calls (see
  // resolveDevice). Null until the first unowned resolveDevice() invocation;
  // thereafter holds the acquisition promise so every concurrent caller
  // awaits the same result and observes the same GPUDevice.
  private deviceAcquisition: Promise<GPUDevice> | null = null;
  private tracker: TrackedDevice | null = null;
  private encodeOptions: EncodeOptions | null = null;
  private disposed = false;
  private readonly logLevel: LogLevel;

  private constructor(options: PipelineOptions) {
    this.options = options;
    this.logLevel = options.logLevel ?? 'silent';
    const cacheOpts: { maxEntries?: number } = {};
    if (options.maxCacheEntries !== undefined) cacheOpts.maxEntries = options.maxCacheEntries;
    this.pipelineCache = new PipelineCache(cacheOpts);
  }

  static create(options: PipelineOptions = {}): Pipeline {
    return new Pipeline(options);
  }

  /**
   * Start a pipeline from a named preset. Subsequent fluent calls extend the
   * preset, so `Pipeline.fromPreset('avatar').brightness(0.05)` adds a
   * brightness step after the preset's built-in filters.
   */
  static fromPreset(name: PresetName, options: PipelineOptions = {}): Pipeline {
    const preset = getPreset(name);
    if (!preset) {
      throw new PixflowError(
        ErrorCode.INVALID_INPUT,
        `Unknown preset: ${String(name)}. Use listPresets() to enumerate available presets.`,
      );
    }
    const p = new Pipeline(options);
    preset.apply(p);
    return p;
  }

  add(filter: Filter): this {
    this.filters.push(filter);
    return this;
  }

  /** Add or subtract a constant in [-1, 1] from every RGB channel. */
  brightness(amount: number): this;
  brightness(params: BrightnessParams): this;
  brightness(input: number | BrightnessParams): this {
    const params: BrightnessParams = typeof input === 'number' ? { amount: input } : input;
    this.filters.push(new BrightnessFilter(params));
    return this;
  }

  /** Scale RGB around 0.5 by `1 + amount`, with `amount` in [-1, 1]. */
  contrast(amount: number): this;
  contrast(params: ContrastParams): this;
  contrast(input: number | ContrastParams): this {
    const params: ContrastParams = typeof input === 'number' ? { amount: input } : input;
    this.filters.push(new ContrastFilter(params));
    return this;
  }

  /** Adjust saturation in HSL space; `amount` in [-1, 1]. -1 → grayscale. */
  saturation(amount: number): this;
  saturation(params: SaturationParams): this;
  saturation(input: number | SaturationParams): this {
    const params: SaturationParams = typeof input === 'number' ? { amount: input } : input;
    this.filters.push(new SaturationFilter(params));
    return this;
  }

  /** Lanczos-3 resize with Sharp.js-compatible fit modes. */
  resize(params: ResizeParams): this {
    this.filters.push(new ResizeFilter(params));
    return this;
  }

  /** Crop a sub-rectangle. Coordinates are in input-pixel space. */
  crop(params: CropParams): this {
    this.filters.push(new CropFilter(params));
    return this;
  }

  /** Rotate by 90 / 180 / 270 degrees clockwise (1, 2, or 3 turns). */
  rotate90(turns: 1 | 2 | 3): this;
  rotate90(params: Rotate90Params): this;
  rotate90(input: 1 | 2 | 3 | Rotate90Params): this {
    const params: Rotate90Params = typeof input === 'number' ? { turns: input } : input;
    this.filters.push(new Rotate90Filter(params));
    return this;
  }

  /** Mirror horizontally, vertically, or both. */
  flip(axis: FlipAxis): this;
  flip(params: FlipParams): this;
  flip(input: FlipAxis | FlipParams): this {
    const params: FlipParams = typeof input === 'string' ? { axis: input } : input;
    this.filters.push(new FlipFilter(params));
    return this;
  }

  /** Add solid-color padding around the image. */
  pad(params: PadParams): this {
    this.filters.push(new PadFilter(params));
    return this;
  }

  /** Separable two-pass Gaussian blur. `radius` in pixels, [0, 64]. */
  gaussianBlur(radius: number): this;
  gaussianBlur(params: GaussianBlurParams): this;
  gaussianBlur(input: number | GaussianBlurParams): this {
    const params: GaussianBlurParams = typeof input === 'number' ? { radius: input } : input;
    this.filters.push(new GaussianBlurFilter(params));
    return this;
  }

  /** Unsharp mask: `original + (original − blur) × amount`. */
  unsharpMask(params: UnsharpMaskParams): this {
    this.filters.push(new UnsharpMaskFilter(params));
    return this;
  }

  /** Overlay a watermark image with alpha compositing. */
  watermark(params: WatermarkParams): this {
    this.filters.push(new WatermarkFilter(params));
    return this;
  }

  /**
   * Replace pixels inside each region with a mosaic of blockSize × blockSize
   * blocks. Outside regions are untouched. Regions are in the input-texture's
   * pixel coordinate space at the point this filter runs in the chain — if
   * you resize or crop first, remap regions yourself.
   */
  pixelate(params: PixelateParams): this {
    this.filters.push(new PixelateFilter(params));
    return this;
  }

  /**
   * Apply a 2D gaussian blur (sigma in pixels) restricted to the given regions.
   * Pixels outside regions are passed through unchanged. Same coordinate-space
   * rules as pixelate().
   */
  regionBlur(params: RegionBlurParams): this {
    this.filters.push(new RegionBlurFilter(params));
    return this;
  }

  /**
   * Apply a tone curve. Pass control points as `[input, output]` pairs in
   * [0, 1]; the pipeline builds a 256-entry LUT by piecewise linear
   * interpolation. Endpoints (0,0)/(1,1) are pinned automatically when
   * missing.
   */
  curves(points: readonly CurvePoint[]): this;
  curves(params: CurvesParams): this;
  curves(input: readonly CurvePoint[] | CurvesParams): this {
    const params: CurvesParams = Array.isArray(input) ? { points: input } : (input as CurvesParams);
    this.filters.push(new CurvesFilter(params));
    return this;
  }

  /** Shift color temperature (warm/cool) and tint (green/magenta), each in [-1, 1]. */
  whiteBalance(params: WhiteBalanceParams): this {
    this.filters.push(new WhiteBalanceFilter(params));
    return this;
  }

  /**
   * Apply an arbitrary 4×4 row-major matrix to (R, G, B, A) with optional
   * additive bias. Useful for tone-mapping presets, channel mixing, sepia,
   * grayscale, etc.
   */
  colorMatrix(params: ColorMatrixParams): this;
  colorMatrix(matrix: readonly number[]): this;
  colorMatrix(input: ColorMatrixParams | readonly number[]): this {
    const params: ColorMatrixParams = Array.isArray(input)
      ? { matrix: input }
      : (input as ColorMatrixParams);
    this.filters.push(new ColorMatrixFilter(params));
    return this;
  }

  /**
   * Apply EXIF orientation. Called with no args, the pipeline reads the EXIF
   * orientation of the source image at `run()` time — different images in a
   * batch can therefore carry different orientations. Called with a number
   * (1-8), the orientation is fixed for every subsequent run.
   */
  orient(): this;
  orient(orientation: number): this;
  orient(orientation?: number): this {
    if (orientation === undefined) {
      this.filters.push(new AutoOrientFilter());
      return this;
    }
    if (!isExifOrientation(orientation)) {
      throw new PixflowError(
        ErrorCode.INVALID_INPUT,
        `orient() expects an EXIF orientation in [1, 8]; got ${String(orientation)}.`,
      );
    }
    for (const f of orientFilters(orientation)) this.filters.push(f);
    return this;
  }

  async orientFromExif(source: Blob | ArrayBuffer): Promise<this> {
    const orientation = await readExifOrientation(source);
    return this.orient(orientation);
  }

  /**
   * Configure the terminal encoding step. Returns `this` so it can sit at the
   * end of a fluent chain, e.g. `Pipeline.create().resize(...).encode({ format
   * : 'image/webp', quality: 0.85 })`. Per-call options passed to `run()` or
   * `batch()` override these defaults.
   */
  encode(options: EncodeOptions = {}): this {
    this.encodeOptions = { ...options };
    return this;
  }

  /** Remove every filter and clear the stored encode options. Cached pipelines
   * and pool buckets are kept so subsequent `run()` calls stay warm. */
  reset(): this {
    // Dispose any owned per-filter resources (uniform buffers) before dropping.
    for (const f of this.filters) f.dispose?.();
    this.filters = [];
    this.encodeOptions = null;
    return this;
  }

  /**
   * Copy the filter list + encode options into a new Pipeline. The returned
   * pipeline shares no state with the original — ideal for running the same
   * recipe against a different device, or applying a small tweak without
   * mutating the original chain.
   */
  clone(): Pipeline {
    const copy = new Pipeline(this.options);
    copy.filters = this.filters.map((f) => cloneFilterInstance(f) ?? f);
    copy.encodeOptions = this.encodeOptions ? { ...this.encodeOptions } : null;
    return copy;
  }

  /**
   * Replace the filter at `index` in-place. Useful for building a pipeline
   * once and iterating on one parameter (e.g. a live slider). Out-of-bounds
   * indices throw INVALID_INPUT.
   */
  replace(index: number, filter: Filter): this {
    if (!Number.isInteger(index) || index < 0 || index >= this.filters.length) {
      throw new PixflowError(
        ErrorCode.INVALID_INPUT,
        `replace() index ${String(index)} is out of range [0, ${String(this.filters.length)}).`,
      );
    }
    const old = this.filters[index];
    old?.dispose?.();
    this.filters[index] = filter;
    return this;
  }

  get length(): number {
    return this.filters.length;
  }

  describe(): readonly { name: string; hash: string }[] {
    return this.filters.map((f) => ({ name: f.name, hash: f.hash() }));
  }

  /**
   * Execute the pipeline. Accepts a single source or an array of sources; an
   * array of length > 1 auto-routes to batch(), so callers don't need to pick
   * between `run` and `batch` manually.
   */
  async run(source: ImageSource, options?: RunOptions): Promise<PipelineResult>;
  async run(sources: ImageSource[], options?: BatchOptions): Promise<PipelineResult[]>;
  async run(
    source: ImageSource | ImageSource[],
    options: RunOptions | BatchOptions = {},
  ): Promise<PipelineResult | PipelineResult[]> {
    if (Array.isArray(source)) {
      return this.batch(source, options as BatchOptions);
    }
    return this.runOne(source, options as RunOptions);
  }

  private async runOne(source: ImageSource, options: RunOptions = {}): Promise<PipelineResult> {
    if (this.disposed) {
      throw new PixflowError(ErrorCode.INTERNAL, 'Pipeline used after dispose().');
    }
    if (this.filters.length === 0) {
      throw new PixflowError(
        ErrorCode.INVALID_INPUT,
        'Pipeline has no filters. Add at least one before calling run().',
      );
    }

    const start = now();
    const device = await this.resolveDevice();
    this.tracker?.assertAlive();
    const textureFormat = this.options.textureFormat ?? DEFAULT_FORMAT;
    const pool = this.resolvePool(device);

    const isolatedFilters = isolateFiltersForRun(await expandAutoOrient(this.filters, source));
    try {
      let effectiveFilters = isolatedFilters.map((x) => x.filter);
      // Skip identity filters — brightness(0), contrast(0), curves linear, etc.
      effectiveFilters = effectiveFilters.filter((f) => f.isIdentity !== true);
      if (this.logLevel === 'debug') {
        console.warn(
          `[pixflow] running ${String(effectiveFilters.length)} filter(s):`,
          effectiveFilters.map((f) => f.name).join(', '),
        );
      }

      if (effectiveFilters.length === 0) {
        // All filters were identity — still need to produce output. Import,
        // encode, and return. We don't run a compute pass.
        const imported = await imageToTexture(device, source, { format: textureFormat });
        try {
          const readbackOptions = buildReadbackOptions(this.encodeOptions, options);
          const encoded = await textureToBlob(device, imported.texture, readbackOptions);
          const durationMs = now() - start;
          const requestedFormat = readbackOptions.format;
          return {
            blob: encoded.blob,
            width: imported.width,
            height: imported.height,
            stats: {
              durationMs,
              filterCount: 0,
              inputWidth: imported.width,
              inputHeight: imported.height,
              outputWidth: imported.width,
              outputHeight: imported.height,
              poolReuses: pool.stats.reuses,
              poolAllocations: pool.stats.allocations,
              cacheSize: this.pipelineCache.size,
              format: encoded.format,
              ...(encoded.fallback !== undefined && requestedFormat !== undefined
                ? { requestedFormat }
                : {}),
            },
          };
        } finally {
          imported.texture.destroy();
        }
      }

      const imported = await imageToTexture(device, source, { format: textureFormat });
      const inputDims: Dims = { width: imported.width, height: imported.height };
      const stepDims = computeStepDims(inputDims, effectiveFilters);

      const encoder = device.createCommandEncoder({ label: 'pixflow.pipeline' });
      const ctx: ExecutionContext = {
        device,
        queue: device.queue,
        encoder,
        pipelineCache: this.pipelineCache,
        texturePool: pool,
        textureFormat,
      };

      // Track pool ownership so we can release exactly once per texture.
      const owned = new Set<GPUTexture>();
      let lastSrc: GPUTexture = imported.texture;
      try {
        for (let i = 0; i < effectiveFilters.length; i++) {
          const f = effectiveFilters[i];
          if (!f) continue;
          const inDims = stepDims[i];
          const outDims = stepDims[i + 1];
          if (!inDims || !outDims) continue;
          await f.prepare(ctx, inDims, outDims);
        }

        let src: GPUTexture = imported.texture;
        let prevOwned: GPUTexture | null = null;
        for (let i = 0; i < effectiveFilters.length; i++) {
          const f = effectiveFilters[i];
          if (!f) continue;
          const outDims = stepDims[i + 1];
          if (!outDims) continue;
          const dst = pool.acquire(outDims.width, outDims.height, textureFormat);
          owned.add(dst);
          f.execute(src, dst, ctx);
          if (prevOwned) {
            pool.release(prevOwned);
            owned.delete(prevOwned);
          }
          prevOwned = dst;
          src = dst;
        }
        lastSrc = src;

        device.queue.submit([encoder.finish()]);

        const readbackOptions = buildReadbackOptions(this.encodeOptions, options);
        const encoded = await textureToBlob(device, lastSrc, readbackOptions);

        const finalDims = stepDims[stepDims.length - 1] ?? inputDims;
        const poolStats = pool.stats;
        const durationMs = now() - start;
        const requestedFormat = readbackOptions.format;
        const stats = {
          durationMs,
          filterCount: effectiveFilters.length,
          inputWidth: inputDims.width,
          inputHeight: inputDims.height,
          outputWidth: finalDims.width,
          outputHeight: finalDims.height,
          poolReuses: poolStats.reuses,
          poolAllocations: poolStats.allocations,
          cacheSize: this.pipelineCache.size,
          format: encoded.format,
          ...(encoded.fallback !== undefined && requestedFormat !== undefined
            ? { requestedFormat }
            : {}),
        };
        return {
          blob: encoded.blob,
          width: finalDims.width,
          height: finalDims.height,
          stats,
        };
      } catch (err) {
        this.tracker?.assertAlive();
        throw wrapPipelineError(err);
      } finally {
        imported.texture.destroy();
        for (const tex of owned) pool.release(tex);
      }
    } finally {
      for (const isolated of isolatedFilters) {
        if (isolated.disposable) isolated.filter.dispose?.();
      }
    }
  }

  /**
   * Process a list of sources with bounded concurrency. Decode (CPU) and GPU
   * work overlap: while the GPU processes image N, image N+1 is decoded on
   * CPU via a simple producer-consumer queue. Progress fires after every
   * completion and an AbortSignal cancels subsequent starts (in-flight runs
   * finish). Results are returned in input order.
   */
  async batch(sources: ImageSource[], options: BatchOptions = {}): Promise<PipelineResult[]> {
    if (this.disposed) {
      throw new PixflowError(ErrorCode.INTERNAL, 'Pipeline used after dispose().');
    }
    const total = sources.length;
    const concurrency = Math.max(1, Math.min(options.concurrency ?? DEFAULT_CONCURRENCY, total));
    if (total === 0) return [];

    if (options.signal?.aborted) {
      throw toAbortError(options.signal);
    }

    const runOptions = pickRunOptions(options);
    const results: PipelineResult[] = new Array(total);
    let nextIndex = 0;
    let completed = 0;
    let aborted = false;

    const onAbort = (): void => {
      aborted = true;
    };
    options.signal?.addEventListener('abort', onAbort);

    try {
      const workers = Array.from({ length: concurrency }, async () => {
        while (true) {
          if (aborted) return;
          // nextIndex++ is safe here despite multiple workers: JavaScript is
          // single-threaded, and the ++ runs to completion before any await
          // yields control back to another worker.
          const i = nextIndex;
          nextIndex += 1;
          if (i >= total) return;
          const src = sources[i];
          if (src === undefined) continue;
          const result = await this.runOne(src, runOptions);
          results[i] = result;
          completed++;
          options.onProgress?.(completed, total, result, i);
        }
      });
      await Promise.all(workers);
    } finally {
      options.signal?.removeEventListener('abort', onAbort);
    }

    if (aborted) {
      throw toAbortError(options.signal);
    }

    return results;
  }

  get cache(): PipelineCache {
    return this.pipelineCache;
  }

  get pool(): TexturePool | null {
    return this.texturePool;
  }

  dispose(): void {
    // Double-dispose should be a no-op, never throw — users commonly wire
    // dispose() into framework effect cleanups that may fire twice.
    if (this.disposed) return;
    this.disposed = true;
    for (const f of this.filters) f.dispose?.();
    this.pipelineCache.clear();
    this.texturePool?.dispose();
    this.texturePool = null;
    if (this.ownedDevice) {
      this.ownedDevice.destroy();
      this.ownedDevice = null;
    }
    this.deviceAcquisition = null;
    this.tracker = null;
  }

  private async resolveDevice(): Promise<GPUDevice> {
    if (this.options.device) {
      if (!this.tracker || this.tracker.device !== this.options.device) {
        this.tracker = trackDevice(this.options.device);
      }
      this.tracker.assertAlive();
      return this.options.device;
    }
    if (this.ownedDevice) {
      this.tracker?.assertAlive();
      return this.ownedDevice;
    }
    // Cache the in-flight acquisition so concurrent batch workers share the
    // same device. Without this latch, each worker's `await acquireDevice()`
    // would resolve independently and overwrite `this.ownedDevice`, producing
    // multiple GPUDevice instances within one pipeline. Textures created on
    // one device cannot be used with another, which surfaces as "Texture is
    // associated with [Device] and cannot be used with [Device]" validation
    // errors and empty/corrupt output for subsequent batch items.
    if (!this.deviceAcquisition) {
      this.deviceAcquisition = acquireDevice().then((acquired) => {
        this.ownedDevice = acquired.device;
        this.tracker = trackDevice(acquired.device);
        return acquired.device;
      });
    }
    return this.deviceAcquisition;
  }

  private resolvePool(device: GPUDevice): TexturePool {
    if (this.texturePool) return this.texturePool;
    const poolOpts: { device: GPUDevice; maxMemoryMB?: number } = { device };
    if (this.options.maxMemoryMB !== undefined) poolOpts.maxMemoryMB = this.options.maxMemoryMB;
    this.texturePool = new TexturePool(poolOpts);
    return this.texturePool;
  }
}

/**
 * Zero-config convenience: decode → apply a few filters → encode. Covers the
 * 90% use case without needing to know about WebGPU, pools, or pipelines.
 *
 *   const blob = await process(file, { resize: { width: 800 }, webp: 0.85 });
 */
export interface ProcessOptions {
  readonly resize?: ResizeParams;
  readonly brightness?: number;
  readonly contrast?: number;
  readonly saturation?: number;
  readonly sharpen?: UnsharpMaskParams | number;
  readonly orient?: boolean;
  readonly format?: EncodeOptions['format'];
  readonly quality?: number;
  /** Shortcut: webp quality 0..1. Sets format=webp if not already set. */
  readonly webp?: number;
  /** Shortcut: jpeg quality 0..1. Sets format=jpeg if not already set. */
  readonly jpeg?: number;
  /** Shortcut: avif quality 0..1. Sets format=avif if not already set. */
  readonly avif?: number;
  /** Optional custom pipeline options (e.g. a shared GPUDevice). */
  readonly pipeline?: PipelineOptions;
}

export async function process(source: ImageSource, options: ProcessOptions = {}): Promise<Blob> {
  const result = await processWithStats(source, options);
  return result.blob;
}

export async function processWithStats(
  source: ImageSource,
  options: ProcessOptions = {},
): Promise<PipelineResult> {
  const p = Pipeline.create(options.pipeline ?? {});
  try {
    if (options.orient) p.orient();
    if (options.resize) p.resize(options.resize);
    if (options.brightness !== undefined) p.brightness(options.brightness);
    if (options.contrast !== undefined) p.contrast(options.contrast);
    if (options.saturation !== undefined) p.saturation(options.saturation);
    if (options.sharpen !== undefined) {
      const sharp =
        typeof options.sharpen === 'number' ? { amount: options.sharpen, radius: 1 } : options.sharpen;
      p.unsharpMask(sharp);
    }
    const encode: { format?: EncodeOptions['format']; quality?: number } = {};
    if (options.webp !== undefined) {
      encode.format = 'image/webp';
      encode.quality = options.webp;
    } else if (options.jpeg !== undefined) {
      encode.format = 'image/jpeg';
      encode.quality = options.jpeg;
    } else if (options.avif !== undefined) {
      encode.format = 'image/avif';
      encode.quality = options.avif;
    }
    if (options.format !== undefined) encode.format = options.format;
    if (options.quality !== undefined) encode.quality = options.quality;
    if (encode.format !== undefined || encode.quality !== undefined) {
      p.encode(encode as EncodeOptions);
    }
    if (p.length === 0) {
      // Nothing to do: force a single no-op so the pipeline still encodes.
      p.brightness(0);
    }
    return await p.run(source);
  } finally {
    p.dispose();
  }
}

export function computeStepDims(input: Dims, filters: readonly Filter[]): Dims[] {
  const dims: Dims[] = [input];
  let cur = input;
  for (const f of filters) {
    cur = f.outputSize ? f.outputSize(cur) : cur;
    dims.push(cur);
  }
  return dims;
}

async function expandAutoOrient(
  filters: readonly Filter[],
  source: ImageSource,
): Promise<Filter[]> {
  if (!filters.some((f) => f instanceof AutoOrientFilter)) {
    return filters.slice();
  }
  const orientation = await orientationFromSource(source);
  const expanded: Filter[] = [];
  for (const f of filters) {
    if (f instanceof AutoOrientFilter) {
      for (const orientFilter of orientFilters(orientation)) {
        expanded.push(orientFilter);
      }
    } else {
      expanded.push(f);
    }
  }
  return expanded;
}

async function orientationFromSource(source: ImageSource): Promise<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8> {
  if (source instanceof Blob) {
    return readExifOrientation(source);
  }
  if (source instanceof ArrayBuffer) {
    return readExifOrientation(source);
  }
  // URL strings, ImageBitmap, HTMLImageElement don't carry readable EXIF here —
  // assume the browser already oriented them.
  return 1;
}

function now(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function buildReadbackOptions(
  pipelineDefaults: EncodeOptions | null,
  perCall: RunOptions,
): ReadbackOptions {
  const out: {
    format?: ReadbackOptions['format'];
    quality?: ReadbackOptions['quality'];
    canvas?: ReadbackOptions['canvas'];
  } = {};
  if (pipelineDefaults?.format !== undefined) out.format = pipelineDefaults.format;
  if (pipelineDefaults?.quality !== undefined) out.quality = pipelineDefaults.quality;
  if (perCall.format !== undefined) out.format = perCall.format;
  if (perCall.quality !== undefined) out.quality = perCall.quality;
  if (perCall.canvas !== undefined) out.canvas = perCall.canvas;
  return out as ReadbackOptions;
}

function pickRunOptions(options: BatchOptions): RunOptions {
  const out: { format?: RunOptions['format']; quality?: number; canvas?: RunOptions['canvas'] } =
    {};
  if (options.format !== undefined) out.format = options.format;
  if (options.quality !== undefined) out.quality = options.quality;
  if (options.canvas !== undefined) out.canvas = options.canvas;
  return out as RunOptions;
}

function toAbortError(signal: AbortSignal | undefined): PixflowError {
  const reason =
    signal?.reason instanceof Error
      ? signal.reason.message
      : signal?.reason !== undefined
        ? String(signal.reason)
        : 'aborted';
  return new PixflowError(ErrorCode.INVALID_INPUT, `batch() aborted: ${reason}`);
}

function wrapPipelineError(err: unknown): unknown {
  if (PixflowError.is(err)) return err;
  // Out-of-memory is the most useful one to translate — the WebGPU spec emits
  // a GPUOutOfMemoryError whose .message is usually terse.
  if (typeof err === 'object' && err !== null) {
    const name = (err as { name?: string }).name;
    if (name === 'GPUOutOfMemoryError' || name === 'OutOfMemoryError') {
      return new PixflowError(
        ErrorCode.OUT_OF_MEMORY,
        `GPU out of memory while running pipeline.`,
        { cause: err },
      );
    }
  }
  return err;
}

// Keep the import-side decode hook reachable for future batching work that
// wants to invoke it independently of the pipeline. Re-export intentionally
// unused from this file so tree-shaking drops it when unused.
export { sourceToImageBitmap };

interface IsolatedFilter {
  readonly filter: Filter;
  readonly disposable: boolean;
}

function isolateFiltersForRun(filters: readonly Filter[]): IsolatedFilter[] {
  return filters.map((f) => {
    const cloned = cloneFilterInstance(f);
    if (cloned) return { filter: cloned, disposable: true };
    return { filter: f, disposable: false };
  });
}

function cloneFilterInstance(filter: Filter): Filter | null {
  if (filter instanceof BrightnessFilter) {
    return new BrightnessFilter({ ...filter.params });
  }
  if (filter instanceof ContrastFilter) {
    return new ContrastFilter({ ...filter.params });
  }
  if (filter instanceof SaturationFilter) {
    return new SaturationFilter({ ...filter.params });
  }
  if (filter instanceof ResizeFilter) {
    return new ResizeFilter({ ...filter.params });
  }
  if (filter instanceof CropFilter) {
    return new CropFilter({ ...filter.params });
  }
  if (filter instanceof Rotate90Filter) {
    return new Rotate90Filter({ ...filter.params });
  }
  if (filter instanceof FlipFilter) {
    return new FlipFilter({ ...filter.params });
  }
  if (filter instanceof PadFilter) {
    const params: PadParams = filter.params.color
      ? { ...filter.params, color: { ...filter.params.color } }
      : { ...filter.params };
    return new PadFilter(params);
  }
  if (filter instanceof GaussianBlurFilter) {
    return new GaussianBlurFilter({ ...filter.params });
  }
  if (filter instanceof UnsharpMaskFilter) {
    return new UnsharpMaskFilter({ ...filter.params });
  }
  if (filter instanceof WatermarkFilter) {
    return new WatermarkFilter({ ...filter.params });
  }
  if (filter instanceof CurvesFilter) {
    return new CurvesFilter({
      points: filter.params.points.map(([x, y]) => [x, y] as CurvePoint),
    });
  }
  if (filter instanceof WhiteBalanceFilter) {
    return new WhiteBalanceFilter({ ...filter.params });
  }
  if (filter instanceof ColorMatrixFilter) {
    const params: ColorMatrixParams = filter.params.bias
      ? {
          matrix: [...filter.params.matrix],
          bias: [...filter.params.bias] as [number, number, number, number],
        }
      : { matrix: [...filter.params.matrix] };
    return new ColorMatrixFilter(params);
  }
  if (filter instanceof AutoOrientFilter) {
    return new AutoOrientFilter();
  }
  return null;
}
