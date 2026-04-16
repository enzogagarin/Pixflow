import { acquireDevice } from '../backends/webgpu/device.js';
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
import { WhiteBalanceFilter, type WhiteBalanceParams } from '../filters/white-balance.js';
import { imageToTexture } from '../resources/image-import.js';
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

export interface PipelineOptions {
  readonly device?: GPUDevice;
  readonly textureFormat?: GPUTextureFormat;
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
  private readonly filters: Filter[] = [];
  private readonly options: PipelineOptions;
  private readonly pipelineCache = new PipelineCache();
  private texturePool: TexturePool | null = null;
  private ownedDevice: GPUDevice | null = null;
  private encodeOptions: EncodeOptions | null = null;

  private constructor(options: PipelineOptions) {
    this.options = options;
  }

  static create(options: PipelineOptions = {}): Pipeline {
    return new Pipeline(options);
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
    this.filters.length = 0;
    this.encodeOptions = null;
    return this;
  }

  get length(): number {
    return this.filters.length;
  }

  describe(): readonly { name: string; hash: string }[] {
    return this.filters.map((f) => ({ name: f.name, hash: f.hash() }));
  }

  async run(source: ImageSource, options: RunOptions = {}): Promise<PipelineResult> {
    if (this.filters.length === 0) {
      throw new PixflowError(
        ErrorCode.INVALID_INPUT,
        'Pipeline has no filters. Add at least one before calling run().',
      );
    }

    const start = now();
    const device = await this.resolveDevice();
    const textureFormat = this.options.textureFormat ?? DEFAULT_FORMAT;
    const pool = this.resolvePool(device);

    const effectiveFilters = await expandAutoOrient(this.filters, source);

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

    for (let i = 0; i < effectiveFilters.length; i++) {
      const f = effectiveFilters[i];
      if (!f) continue;
      const inDims = stepDims[i];
      const outDims = stepDims[i + 1];
      if (!inDims || !outDims) continue;
      await f.prepare(ctx, inDims, outDims);
    }

    let src: GPUTexture = imported.texture;
    const acquired: GPUTexture[] = [];
    for (let i = 0; i < effectiveFilters.length; i++) {
      const f = effectiveFilters[i];
      if (!f) continue;
      const outDims = stepDims[i + 1];
      if (!outDims) continue;
      const dst = pool.acquire(outDims.width, outDims.height, textureFormat);
      acquired.push(dst);
      f.execute(src, dst, ctx);
      if (i > 0) {
        const prev = acquired[i - 1];
        if (prev) pool.release(prev);
      }
      src = dst;
    }

    device.queue.submit([encoder.finish()]);

    const readbackOptions = buildReadbackOptions(this.encodeOptions, options);
    const encoded = await textureToBlob(device, src, readbackOptions);

    const finalDims = stepDims[stepDims.length - 1] ?? inputDims;
    imported.texture.destroy();
    if (acquired.length > 0) {
      const last = acquired[acquired.length - 1];
      if (last) pool.release(last);
    }

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
  }

  /**
   * Process a list of sources with bounded concurrency. Progress fires after
   * every completion and an AbortSignal cancels subsequent starts (in-flight
   * runs finish). Results are returned in input order.
   */
  async batch(sources: ImageSource[], options: BatchOptions = {}): Promise<PipelineResult[]> {
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
          const i = nextIndex++;
          if (i >= total) return;
          const src = sources[i];
          if (src === undefined) continue;
          const result = await this.run(src, runOptions);
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
    this.pipelineCache.clear();
    this.texturePool?.dispose();
    this.texturePool = null;
    if (this.ownedDevice) {
      this.ownedDevice.destroy();
      this.ownedDevice = null;
    }
  }

  private async resolveDevice(): Promise<GPUDevice> {
    if (this.options.device) return this.options.device;
    if (this.ownedDevice) return this.ownedDevice;
    const acquired = await acquireDevice();
    this.ownedDevice = acquired.device;
    return this.ownedDevice;
  }

  private resolvePool(device: GPUDevice): TexturePool {
    if (this.texturePool) return this.texturePool;
    this.texturePool = new TexturePool({ device });
    return this.texturePool;
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
