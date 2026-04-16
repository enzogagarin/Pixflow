import { acquireDevice } from '../backends/webgpu/device.js';
import { textureToBlob, type ReadbackOptions } from '../codec/readback.js';
import { ErrorCode, PixflowError } from '../errors.js';
import { BrightnessFilter, type BrightnessParams } from '../filters/brightness.js';
import { ContrastFilter, type ContrastParams } from '../filters/contrast.js';
import { CropFilter, type CropParams } from '../filters/crop.js';
import { FlipFilter, type FlipParams, type FlipAxis } from '../filters/flip.js';
import { GaussianBlurFilter, type GaussianBlurParams } from '../filters/gaussian-blur.js';
import { PadFilter, type PadParams } from '../filters/pad.js';
import { ResizeFilter, type ResizeParams } from '../filters/resize.js';
import { Rotate90Filter, type Rotate90Params } from '../filters/rotate90.js';
import { SaturationFilter, type SaturationParams } from '../filters/saturation.js';
import { UnsharpMaskFilter, type UnsharpMaskParams } from '../filters/unsharp-mask.js';
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

const DEFAULT_FORMAT: GPUTextureFormat = 'rgba8unorm';

export class Pipeline {
  private readonly filters: Filter[] = [];
  private readonly options: PipelineOptions;
  private readonly pipelineCache = new PipelineCache();
  private texturePool: TexturePool | null = null;
  private ownedDevice: GPUDevice | null = null;

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

  brightness(amount: number): this;
  brightness(params: BrightnessParams): this;
  brightness(input: number | BrightnessParams): this {
    const params: BrightnessParams = typeof input === 'number' ? { amount: input } : input;
    this.filters.push(new BrightnessFilter(params));
    return this;
  }

  contrast(amount: number): this;
  contrast(params: ContrastParams): this;
  contrast(input: number | ContrastParams): this {
    const params: ContrastParams = typeof input === 'number' ? { amount: input } : input;
    this.filters.push(new ContrastFilter(params));
    return this;
  }

  saturation(amount: number): this;
  saturation(params: SaturationParams): this;
  saturation(input: number | SaturationParams): this {
    const params: SaturationParams = typeof input === 'number' ? { amount: input } : input;
    this.filters.push(new SaturationFilter(params));
    return this;
  }

  resize(params: ResizeParams): this {
    this.filters.push(new ResizeFilter(params));
    return this;
  }

  crop(params: CropParams): this {
    this.filters.push(new CropFilter(params));
    return this;
  }

  rotate90(turns: 1 | 2 | 3): this;
  rotate90(params: Rotate90Params): this;
  rotate90(input: 1 | 2 | 3 | Rotate90Params): this {
    const params: Rotate90Params = typeof input === 'number' ? { turns: input } : input;
    this.filters.push(new Rotate90Filter(params));
    return this;
  }

  flip(axis: FlipAxis): this;
  flip(params: FlipParams): this;
  flip(input: FlipAxis | FlipParams): this {
    const params: FlipParams = typeof input === 'string' ? { axis: input } : input;
    this.filters.push(new FlipFilter(params));
    return this;
  }

  pad(params: PadParams): this {
    this.filters.push(new PadFilter(params));
    return this;
  }

  gaussianBlur(radius: number): this;
  gaussianBlur(params: GaussianBlurParams): this;
  gaussianBlur(input: number | GaussianBlurParams): this {
    const params: GaussianBlurParams = typeof input === 'number' ? { radius: input } : input;
    this.filters.push(new GaussianBlurFilter(params));
    return this;
  }

  unsharpMask(params: UnsharpMaskParams): this {
    this.filters.push(new UnsharpMaskFilter(params));
    return this;
  }

  orient(orientation: number): this {
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

    const imported = await imageToTexture(device, source, { format: textureFormat });
    const inputDims: Dims = { width: imported.width, height: imported.height };

    const stepDims = computeStepDims(inputDims, this.filters);

    const encoder = device.createCommandEncoder({ label: 'pixflow.pipeline' });
    const ctx: ExecutionContext = {
      device,
      queue: device.queue,
      encoder,
      pipelineCache: this.pipelineCache,
      texturePool: pool,
      textureFormat,
    };

    for (let i = 0; i < this.filters.length; i++) {
      const f = this.filters[i];
      if (!f) continue;
      const inDims = stepDims[i];
      const outDims = stepDims[i + 1];
      if (!inDims || !outDims) continue;
      await f.prepare(ctx, inDims, outDims);
    }

    let src: GPUTexture = imported.texture;
    const acquired: GPUTexture[] = [];
    for (let i = 0; i < this.filters.length; i++) {
      const f = this.filters[i];
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

    const blob = await textureToBlob(device, src, buildReadbackOptions(options));

    const finalDims = stepDims[stepDims.length - 1] ?? inputDims;
    imported.texture.destroy();
    // Release the final texture (and any earlier intermediate that wasn't released yet).
    if (acquired.length > 0) {
      const last = acquired[acquired.length - 1];
      if (last) pool.release(last);
    }

    const stats = pool.stats;
    const durationMs = now() - start;
    return {
      blob,
      width: finalDims.width,
      height: finalDims.height,
      stats: {
        durationMs,
        filterCount: this.filters.length,
        inputWidth: inputDims.width,
        inputHeight: inputDims.height,
        outputWidth: finalDims.width,
        outputHeight: finalDims.height,
        poolReuses: stats.reuses,
        poolAllocations: stats.allocations,
        cacheSize: this.pipelineCache.size,
      },
    };
  }

  /** Sequentially process a list of sources. Concurrency support comes in Week 8. */
  async batch(
    sources: ImageSource[],
    options: RunOptions & {
      onProgress?: (done: number, total: number) => void;
      signal?: AbortSignal;
    } = {},
  ): Promise<PipelineResult[]> {
    const results: PipelineResult[] = [];
    const total = sources.length;
    for (let i = 0; i < total; i++) {
      if (options.signal?.aborted) {
        throw new PixflowError(ErrorCode.INVALID_INPUT, 'batch() aborted via signal.');
      }
      const src = sources[i];
      if (!src) continue;
      const result = await this.run(src, options);
      results.push(result);
      options.onProgress?.(i + 1, total);
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

function now(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function buildReadbackOptions(options: RunOptions): ReadbackOptions {
  const out: {
    format?: ReadbackOptions['format'];
    quality?: ReadbackOptions['quality'];
    canvas?: ReadbackOptions['canvas'];
  } = {};
  if (options.format !== undefined) out.format = options.format;
  if (options.quality !== undefined) out.quality = options.quality;
  if (options.canvas !== undefined) out.canvas = options.canvas;
  return out as ReadbackOptions;
}
