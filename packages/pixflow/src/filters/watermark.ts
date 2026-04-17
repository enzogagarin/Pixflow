import { ErrorCode, PixflowError } from '../errors.js';
import { sourceToImageBitmap } from '../resources/image-import.js';
import { WATERMARK_WGSL } from '../shaders/watermark.wgsl.js';
import type { Dims, ExecutionContext, Filter } from '../types.js';
import { WORKGROUP_SIZE, alignTo } from './compute-filter.js';

export type WatermarkPosition =
  | 'bottom-right'
  | 'bottom-left'
  | 'top-right'
  | 'top-left'
  | 'center'
  | 'tile';

export interface WatermarkParams {
  readonly image: ImageBitmap | Blob | HTMLImageElement;
  readonly position?: WatermarkPosition;
  readonly opacity?: number;
  readonly scale?: number;
  readonly margin?: number;
}

interface ResolvedWatermarkParams {
  readonly image: ImageBitmap | Blob | HTMLImageElement;
  readonly position: WatermarkPosition;
  readonly opacity: number;
  readonly scale: number;
  readonly margin: number;
}

const UNIFORM_BYTES = 32;

const POSITION_MODE: Record<WatermarkPosition, number> = {
  'top-left': 0,
  'top-right': 1,
  'bottom-left': 2,
  'bottom-right': 3,
  center: 4,
  tile: 5,
};

const imageObjectIds = new WeakMap<object, number>();
let nextImageObjectId = 1;

export class WatermarkFilter implements Filter<ResolvedWatermarkParams> {
  readonly name = 'watermark';
  readonly stage = 'compute' as const;
  readonly params: ResolvedWatermarkParams;

  private cachedLayout: GPUBindGroupLayout | null = null;
  private cachedPipeline: GPUComputePipeline | null = null;
  private uniformBuffer: GPUBuffer | null = null;
  private uniformSize = 0;
  private watermarkTexture: GPUTexture | null = null;
  private watermarkDims: Dims | null = null;

  get isIdentity(): boolean {
    return this.params.opacity === 0 || this.params.scale === 0;
  }

  constructor(params: WatermarkParams) {
    if (!isSupportedWatermarkSource(params.image)) {
      throw new PixflowError(
        ErrorCode.INVALID_INPUT,
        'watermark.image must be an ImageBitmap, Blob, or HTMLImageElement.',
      );
    }

    const position = params.position ?? 'bottom-right';
    if (!(position in POSITION_MODE)) {
      throw new PixflowError(
        ErrorCode.INVALID_INPUT,
        `watermark.position must be one of top-left, top-right, bottom-left, bottom-right, center, tile; got ${String(position)}.`,
      );
    }

    const opacity = params.opacity ?? 0.5;
    if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
      throw new PixflowError(
        ErrorCode.INVALID_INPUT,
        `watermark.opacity must be a finite number in [0, 1]; got ${String(opacity)}.`,
      );
    }

    const scale = params.scale ?? 0.2;
    if (!Number.isFinite(scale) || scale < 0 || scale > 1) {
      throw new PixflowError(
        ErrorCode.INVALID_INPUT,
        `watermark.scale must be a finite number in [0, 1]; got ${String(scale)}.`,
      );
    }

    const margin = params.margin ?? 16;
    if (!Number.isFinite(margin) || margin < 0) {
      throw new PixflowError(
        ErrorCode.INVALID_INPUT,
        `watermark.margin must be a finite number >= 0; got ${String(margin)}.`,
      );
    }

    this.params = {
      image: params.image,
      position,
      opacity,
      scale,
      margin,
    };
  }

  hash(): string {
    const p = this.params;
    return `watermark|img=${imageHashToken(p.image)}|pos=${p.position}|o=${p.opacity.toFixed(4)}|s=${p.scale.toFixed(4)}|m=${p.margin.toFixed(2)}`;
  }

  outputSize(input: Dims): Dims {
    return input;
  }

  async prepare(ctx: ExecutionContext, _inputDims: Dims, outputDims: Dims): Promise<void> {
    if (!this.cachedLayout) {
      this.cachedLayout = this.bindGroupLayout(ctx);
    }
    const layout = this.cachedLayout;

    this.cachedPipeline = ctx.pipelineCache.getOrCreate(`watermark|${ctx.textureFormat}`, () => {
      const module = ctx.device.createShaderModule({
        label: 'pixflow.watermark.module',
        code: WATERMARK_WGSL,
      });
      return ctx.device.createComputePipeline({
        label: 'pixflow.watermark.pipeline',
        layout: ctx.device.createPipelineLayout({ bindGroupLayouts: [layout] }),
        compute: { module, entryPoint: 'main' },
      });
    });

    await this.ensureWatermarkTexture(ctx);
    const wmDims = this.watermarkDims;
    if (!wmDims) {
      throw new PixflowError(ErrorCode.INTERNAL, 'watermark texture dimensions unavailable after prepare().');
    }

    const aligned = alignTo(UNIFORM_BYTES, 16);
    if (!this.uniformBuffer || this.uniformSize < aligned) {
      if (this.uniformBuffer) this.uniformBuffer.destroy();
      this.uniformBuffer = ctx.device.createBuffer({
        label: 'pixflow.watermark.uniforms',
        size: aligned,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      this.uniformSize = aligned;
    }

    const placement = computePlacement(outputDims, wmDims, this.params);
    const bytes = new ArrayBuffer(aligned);
    const view = new DataView(bytes);
    view.setUint32(0, wmDims.width, true);
    view.setUint32(4, wmDims.height, true);
    view.setUint32(8, placement.drawWidth, true);
    view.setUint32(12, placement.drawHeight, true);
    view.setInt32(16, placement.originX, true);
    view.setInt32(20, placement.originY, true);
    view.setUint32(24, POSITION_MODE[this.params.position], true);
    view.setFloat32(28, this.params.opacity, true);
    ctx.queue.writeBuffer(this.uniformBuffer, 0, bytes);
  }

  execute(input: GPUTexture, output: GPUTexture, ctx: ExecutionContext): void {
    if (!this.cachedPipeline || !this.cachedLayout || !this.uniformBuffer || !this.watermarkTexture) {
      throw new PixflowError(
        ErrorCode.INTERNAL,
        'WatermarkFilter executed before prepare() completed.',
      );
    }

    const bindGroup = ctx.device.createBindGroup({
      label: 'pixflow.watermark.bg',
      layout: this.cachedLayout,
      entries: [
        { binding: 0, resource: input.createView() },
        { binding: 1, resource: this.watermarkTexture.createView() },
        { binding: 2, resource: output.createView() },
        { binding: 3, resource: { buffer: this.uniformBuffer } },
      ],
    });

    const pass = ctx.encoder.beginComputePass({ label: 'pixflow.watermark.pass' });
    pass.setPipeline(this.cachedPipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(
      Math.ceil(output.width / WORKGROUP_SIZE),
      Math.ceil(output.height / WORKGROUP_SIZE),
      1,
    );
    pass.end();
  }

  dispose(): void {
    if (this.uniformBuffer) {
      this.uniformBuffer.destroy();
      this.uniformBuffer = null;
      this.uniformSize = 0;
    }
    if (this.watermarkTexture) {
      this.watermarkTexture.destroy();
      this.watermarkTexture = null;
    }
    this.watermarkDims = null;
    this.cachedLayout = null;
    this.cachedPipeline = null;
  }

  private async ensureWatermarkTexture(ctx: ExecutionContext): Promise<void> {
    if (this.watermarkTexture && this.watermarkDims) return;

    const source = this.params.image;
    const bitmap =
      typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap
        ? source
        : await sourceToImageBitmap(source);

    const width = bitmap.width;
    const height = bitmap.height;
    if (width === 0 || height === 0) {
      throw new PixflowError(
        ErrorCode.INVALID_INPUT,
        `watermark.image has zero dimension: ${width.toString()}x${height.toString()}.`,
      );
    }

    // copyExternalImageToTexture requires the destination to declare
    // RENDER_ATTACHMENT in its usage (WebGPU spec, "GPUQueue.copyExternalImageToTexture":
    // "destination.texture.usage must include RENDER_ATTACHMENT"). Without
    // this flag, Tint emits "Destination texture needs to have CopyDst and
    // RenderAttachment usage." for every render — the watermark texture
    // exists in JS-land but pixflow can't actually upload pixels to it.
    this.watermarkTexture = ctx.device.createTexture({
      label: 'pixflow.watermark.texture',
      size: { width, height, depthOrArrayLayers: 1 },
      format: ctx.textureFormat,
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    ctx.queue.copyExternalImageToTexture(
      { source: bitmap, flipY: false },
      { texture: this.watermarkTexture },
      { width, height },
    );

    this.watermarkDims = { width, height };

    if (!(typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap)) {
      bitmap.close();
    }
  }

  private bindGroupLayout(ctx: ExecutionContext): GPUBindGroupLayout {
    return ctx.device.createBindGroupLayout({
      label: 'pixflow.watermark.bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          texture: { sampleType: 'float', viewDimension: '2d', multisampled: false },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          texture: { sampleType: 'float', viewDimension: '2d', multisampled: false },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: {
            access: 'write-only',
            format: ctx.textureFormat,
            viewDimension: '2d',
          },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'uniform' },
        },
      ],
    });
  }
}

function isSupportedWatermarkSource(value: unknown): value is ImageBitmap | Blob | HTMLImageElement {
  if (typeof ImageBitmap !== 'undefined' && value instanceof ImageBitmap) return true;
  if (typeof Blob !== 'undefined' && value instanceof Blob) return true;
  if (typeof HTMLImageElement !== 'undefined' && value instanceof HTMLImageElement) return true;
  return false;
}

interface Placement {
  readonly drawWidth: number;
  readonly drawHeight: number;
  readonly originX: number;
  readonly originY: number;
}

function computePlacement(output: Dims, wm: Dims, params: ResolvedWatermarkParams): Placement {
  const rawDrawWidth = Math.round(output.width * params.scale);
  const drawWidth = clampInt(rawDrawWidth, 0, output.width);
  if (drawWidth === 0) {
    return { drawWidth: 0, drawHeight: 0, originX: 0, originY: 0 };
  }

  let drawHeight = Math.max(1, Math.round((drawWidth * wm.height) / wm.width));
  if (drawHeight > output.height) {
    drawHeight = output.height;
  }

  let adjustedDrawWidth = Math.max(1, Math.round((drawHeight * wm.width) / wm.height));
  if (adjustedDrawWidth > output.width) adjustedDrawWidth = output.width;

  if (params.position === 'tile') {
    return {
      drawWidth: adjustedDrawWidth,
      drawHeight,
      originX: 0,
      originY: 0,
    };
  }

  const margin = Math.round(params.margin);
  const maxX = Math.max(output.width - adjustedDrawWidth, 0);
  const maxY = Math.max(output.height - drawHeight, 0);

  let originX = margin;
  let originY = margin;

  switch (params.position) {
    case 'top-left':
      originX = margin;
      originY = margin;
      break;
    case 'top-right':
      originX = output.width - adjustedDrawWidth - margin;
      originY = margin;
      break;
    case 'bottom-left':
      originX = margin;
      originY = output.height - drawHeight - margin;
      break;
    case 'bottom-right':
      originX = output.width - adjustedDrawWidth - margin;
      originY = output.height - drawHeight - margin;
      break;
    case 'center':
      originX = Math.round((output.width - adjustedDrawWidth) / 2);
      originY = Math.round((output.height - drawHeight) / 2);
      break;
  }

  return {
    drawWidth: adjustedDrawWidth,
    drawHeight,
    originX: clampInt(originX, 0, maxX),
    originY: clampInt(originY, 0, maxY),
  };
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function imageHashToken(image: ImageBitmap | Blob | HTMLImageElement): string {
  const objectId = getObjectId(image as object);
  if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) {
    return `bitmap:${image.width.toString()}x${image.height.toString()}#${objectId.toString()}`;
  }
  if (typeof Blob !== 'undefined' && image instanceof Blob) {
    const lm = typeof File !== 'undefined' && image instanceof File ? image.lastModified : -1;
    return `blob:${image.size.toString()}:${image.type || 'unknown'}:${lm.toString()}#${objectId.toString()}`;
  }
  if (typeof HTMLImageElement !== 'undefined' && image instanceof HTMLImageElement) {
    const src = image.currentSrc || image.src || '';
    return `img:${image.naturalWidth.toString()}x${image.naturalHeight.toString()}:${src}#${objectId.toString()}`;
  }
  return `unknown#${objectId.toString()}`;
}

function getObjectId(value: object): number {
  const existing = imageObjectIds.get(value);
  if (existing !== undefined) return existing;
  const next = nextImageObjectId++;
  imageObjectIds.set(value, next);
  return next;
}
