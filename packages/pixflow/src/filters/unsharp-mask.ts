import { ErrorCode, PixflowError } from '../errors.js';
import { GAUSSIAN_BLUR_WGSL } from '../shaders/gaussian-blur.wgsl.js';
import { UNSHARP_COMBINE_WGSL } from '../shaders/unsharp-mask.wgsl.js';
import type { Dims, ExecutionContext, Filter } from '../types.js';
import { WORKGROUP_SIZE, alignTo } from './compute-filter.js';

export interface UnsharpMaskParams {
  readonly amount: number;
  readonly radius: number;
  readonly threshold?: number;
}

const BLUR_UNIFORM_BYTES = 16;
const COMBINE_UNIFORM_BYTES = 8;

export class UnsharpMaskFilter implements Filter<UnsharpMaskParams> {
  readonly name = 'unsharpMask';
  readonly stage = 'compute' as const;
  readonly params: UnsharpMaskParams;

  get isIdentity(): boolean {
    return this.params.amount === 0;
  }

  dispose(): void {
    this.hUniform?.destroy();
    this.vUniform?.destroy();
    this.combineUniform?.destroy();
    this.hUniform = null;
    this.vUniform = null;
    this.combineUniform = null;
    this.blurPipeline = null;
    this.combinePipeline = null;
    this.blurLayout = null;
    this.combineLayout = null;
    this.cachedBlurLayout = null;
    this.cachedCombineLayout = null;
  }

  private blurPipeline: GPUComputePipeline | null = null;
  private blurLayout: GPUBindGroupLayout | null = null;
  private combinePipeline: GPUComputePipeline | null = null;
  private combineLayout: GPUBindGroupLayout | null = null;
  private hUniform: GPUBuffer | null = null;
  private vUniform: GPUBuffer | null = null;
  private combineUniform: GPUBuffer | null = null;
  private cachedBlurLayout: GPUBindGroupLayout | null = null;
  private cachedCombineLayout: GPUBindGroupLayout | null = null;

  constructor(params: UnsharpMaskParams) {
    if (!Number.isFinite(params.amount) || params.amount < 0 || params.amount > 5) {
      throw new PixflowError(
        ErrorCode.INVALID_INPUT,
        `unsharpMask.amount must be in [0, 5]; got ${String(params.amount)}.`,
      );
    }
    if (!Number.isFinite(params.radius) || params.radius <= 0 || params.radius > 64) {
      throw new PixflowError(
        ErrorCode.INVALID_INPUT,
        `unsharpMask.radius must be in (0, 64]; got ${String(params.radius)}.`,
      );
    }
    if (
      params.threshold !== undefined &&
      (!Number.isFinite(params.threshold) || params.threshold < 0 || params.threshold > 1)
    ) {
      throw new PixflowError(
        ErrorCode.INVALID_INPUT,
        `unsharpMask.threshold must be in [0, 1]; got ${String(params.threshold)}.`,
      );
    }
    this.params = params;
  }

  hash(): string {
    return `unsharpMask|a=${this.params.amount.toFixed(4)}|r=${this.params.radius.toFixed(2)}|t=${(this.params.threshold ?? 0).toFixed(4)}`;
  }

  async prepare(ctx: ExecutionContext, _input: Dims, _output: Dims): Promise<void> {
    const sigma = Math.max(this.params.radius / 3, 0.0001);
    const invTwoSigmaSq = 1 / (2 * sigma * sigma);
    if (!this.cachedBlurLayout) this.cachedBlurLayout = this.makeBlurLayout(ctx);
    if (!this.cachedCombineLayout) this.cachedCombineLayout = this.makeCombineLayout(ctx);
    this.blurLayout = this.cachedBlurLayout;
    this.combineLayout = this.cachedCombineLayout;

    this.blurPipeline = ctx.pipelineCache.getOrCreate(
      `unsharpMask.blur|${ctx.textureFormat}`,
      () => {
        const module = ctx.device.createShaderModule({ code: GAUSSIAN_BLUR_WGSL });
        return ctx.device.createComputePipeline({
          label: 'pixflow.unsharpMask.blur',
          layout: ctx.device.createPipelineLayout({ bindGroupLayouts: [this.blurLayout!] }),
          compute: { module, entryPoint: 'main' },
        });
      },
    );

    this.combinePipeline = ctx.pipelineCache.getOrCreate(
      `unsharpMask.combine|${ctx.textureFormat}`,
      () => {
        const module = ctx.device.createShaderModule({ code: UNSHARP_COMBINE_WGSL });
        return ctx.device.createComputePipeline({
          label: 'pixflow.unsharpMask.combine',
          layout: ctx.device.createPipelineLayout({ bindGroupLayouts: [this.combineLayout!] }),
          compute: { module, entryPoint: 'main' },
        });
      },
    );

    this.hUniform = this.writeBlurUniform(ctx, 1, 0, invTwoSigmaSq, this.hUniform);
    this.vUniform = this.writeBlurUniform(ctx, 0, 1, invTwoSigmaSq, this.vUniform);
    this.combineUniform = this.writeCombineUniform(ctx, this.combineUniform);
  }

  execute(input: GPUTexture, output: GPUTexture, ctx: ExecutionContext): void {
    if (
      !this.blurPipeline ||
      !this.combinePipeline ||
      !this.blurLayout ||
      !this.combineLayout ||
      !this.hUniform ||
      !this.vUniform ||
      !this.combineUniform
    ) {
      throw new PixflowError(ErrorCode.INTERNAL, 'UnsharpMaskFilter not prepared.');
    }
    const tmp1 = ctx.texturePool.acquire(input.width, input.height, ctx.textureFormat);
    const tmp2 = ctx.texturePool.acquire(input.width, input.height, ctx.textureFormat);

    this.blurPass(input, tmp1, this.hUniform, ctx);
    this.blurPass(tmp1, tmp2, this.vUniform, ctx);
    this.combinePass(input, tmp2, output, ctx);

    ctx.texturePool.release(tmp1);
    ctx.texturePool.release(tmp2);
  }

  private blurPass(
    input: GPUTexture,
    output: GPUTexture,
    uniform: GPUBuffer,
    ctx: ExecutionContext,
  ): void {
    const bg = ctx.device.createBindGroup({
      layout: this.blurLayout!,
      entries: [
        { binding: 0, resource: input.createView() },
        { binding: 1, resource: output.createView() },
        { binding: 2, resource: { buffer: uniform } },
      ],
    });
    const enc = ctx.encoder.beginComputePass();
    enc.setPipeline(this.blurPipeline!);
    enc.setBindGroup(0, bg);
    enc.dispatchWorkgroups(
      Math.ceil(output.width / WORKGROUP_SIZE),
      Math.ceil(output.height / WORKGROUP_SIZE),
      1,
    );
    enc.end();
  }

  private combinePass(
    original: GPUTexture,
    blurred: GPUTexture,
    output: GPUTexture,
    ctx: ExecutionContext,
  ): void {
    const bg = ctx.device.createBindGroup({
      layout: this.combineLayout!,
      entries: [
        { binding: 0, resource: original.createView() },
        { binding: 1, resource: blurred.createView() },
        { binding: 2, resource: output.createView() },
        { binding: 3, resource: { buffer: this.combineUniform! } },
      ],
    });
    const enc = ctx.encoder.beginComputePass();
    enc.setPipeline(this.combinePipeline!);
    enc.setBindGroup(0, bg);
    enc.dispatchWorkgroups(
      Math.ceil(output.width / WORKGROUP_SIZE),
      Math.ceil(output.height / WORKGROUP_SIZE),
      1,
    );
    enc.end();
  }

  private writeBlurUniform(
    ctx: ExecutionContext,
    dirX: number,
    dirY: number,
    invTwoSigmaSq: number,
    existing: GPUBuffer | null,
  ): GPUBuffer {
    const size = alignTo(BLUR_UNIFORM_BYTES, 16);
    const buf =
      existing && existing.size >= size
        ? existing
        : ctx.device.createBuffer({
            size,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
          });
    if (existing && existing !== buf) existing.destroy();
    const bytes = new ArrayBuffer(size);
    const view = new DataView(bytes);
    view.setFloat32(0, dirX, true);
    view.setFloat32(4, dirY, true);
    view.setFloat32(8, this.params.radius, true);
    view.setFloat32(12, invTwoSigmaSq, true);
    ctx.queue.writeBuffer(buf, 0, bytes);
    return buf;
  }

  private writeCombineUniform(ctx: ExecutionContext, existing: GPUBuffer | null): GPUBuffer {
    const size = alignTo(COMBINE_UNIFORM_BYTES, 16);
    const buf =
      existing && existing.size >= size
        ? existing
        : ctx.device.createBuffer({
            size,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
          });
    if (existing && existing !== buf) existing.destroy();
    const bytes = new ArrayBuffer(size);
    const view = new DataView(bytes);
    view.setFloat32(0, this.params.amount, true);
    view.setFloat32(4, this.params.threshold ?? 0, true);
    ctx.queue.writeBuffer(buf, 0, bytes);
    return buf;
  }

  private makeBlurLayout(ctx: ExecutionContext): GPUBindGroupLayout {
    return ctx.device.createBindGroupLayout({
      label: 'pixflow.unsharpMask.blur.bgl',
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

  private makeCombineLayout(ctx: ExecutionContext): GPUBindGroupLayout {
    return ctx.device.createBindGroupLayout({
      label: 'pixflow.unsharpMask.combine.bgl',
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
