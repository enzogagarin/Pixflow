import { acquireDevice } from '../backends/webgpu/device.js';
import { textureToBlob, type ReadbackOptions } from '../codec/readback.js';
import { ErrorCode, PixflowError } from '../errors.js';
import { BrightnessFilter, type BrightnessParams } from '../filters/brightness.js';
import { ContrastFilter, type ContrastParams } from '../filters/contrast.js';
import { createIntermediateTexture, imageToTexture } from '../resources/image-import.js';
import type {
  EncodeOptions,
  ExecutionContext,
  Filter,
  ImageSource,
  PipelineResult,
} from '../types.js';

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
  private readonly pipelineCache: Map<string, GPUComputePipeline> = new Map();
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

    const imported = await imageToTexture(device, source, { format: textureFormat });
    const { width, height } = imported;

    const intermediateA = createIntermediateTexture(device, width, height, textureFormat);
    const intermediateB = createIntermediateTexture(device, width, height, textureFormat);

    const encoder = device.createCommandEncoder({ label: 'pixflow.pipeline' });
    const ctx: ExecutionContext = {
      device,
      queue: device.queue,
      encoder,
      pipelineCache: this.pipelineCache,
      textureFormat,
    };

    for (const filter of this.filters) {
      await filter.prepare(ctx);
    }

    let src: GPUTexture = imported.texture;
    let finalTexture: GPUTexture = imported.texture;
    for (let i = 0; i < this.filters.length; i++) {
      const dst = i % 2 === 0 ? intermediateA : intermediateB;
      const filter = this.filters[i];
      if (!filter) continue;
      filter.execute(src, dst, ctx);
      src = dst;
      finalTexture = dst;
    }

    device.queue.submit([encoder.finish()]);

    const blob = await textureToBlob(device, finalTexture, buildReadbackOptions(options));

    imported.texture.destroy();
    intermediateA.destroy();
    intermediateB.destroy();

    const durationMs = now() - start;
    return {
      blob,
      width,
      height,
      stats: {
        durationMs,
        filterCount: this.filters.length,
        inputWidth: width,
        inputHeight: height,
      },
    };
  }

  dispose(): void {
    this.pipelineCache.clear();
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
