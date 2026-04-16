import { ErrorCode, PixflowError } from '../errors.js';
import { GAUSSIAN_BLUR_WGSL } from '../shaders/gaussian-blur.wgsl.js';
import type { Dims, ExecutionContext, Filter } from '../types.js';
import { WORKGROUP_SIZE, alignTo } from './compute-filter.js';

export interface GaussianBlurParams {
  readonly radius: number;
  readonly sigma?: number;
}

const UNIFORM_BYTES = 16;

interface PreparedPass {
  readonly pipeline: GPUComputePipeline;
  readonly bindGroupLayout: GPUBindGroupLayout;
  readonly uniformBuffer: GPUBuffer;
}

export class GaussianBlurFilter implements Filter<GaussianBlurParams> {
  readonly name = 'gaussianBlur';
  readonly stage = 'compute' as const;
  readonly params: GaussianBlurParams;

  private horizontal: PreparedPass | null = null;
  private vertical: PreparedPass | null = null;
  private cachedLayout: GPUBindGroupLayout | null = null;

  constructor(params: GaussianBlurParams) {
    if (!Number.isFinite(params.radius) || params.radius < 0 || params.radius > 64) {
      throw new PixflowError(
        ErrorCode.INVALID_INPUT,
        `gaussianBlur.radius must be a finite number in [0, 64]; got ${String(params.radius)}.`,
      );
    }
    if (params.sigma !== undefined) {
      if (!Number.isFinite(params.sigma) || params.sigma <= 0) {
        throw new PixflowError(
          ErrorCode.INVALID_INPUT,
          `gaussianBlur.sigma must be a positive finite number; got ${String(params.sigma)}.`,
        );
      }
    }
    this.params = params;
  }

  hash(): string {
    return `gaussianBlur|r=${this.params.radius.toFixed(2)}|s=${(this.params.sigma ?? this.params.radius / 3).toFixed(4)}`;
  }

  async prepare(ctx: ExecutionContext, _input: Dims, _output: Dims): Promise<void> {
    const sigma = this.params.sigma ?? Math.max(this.params.radius / 3, 0.0001);
    const invTwoSigmaSq = 1 / (2 * sigma * sigma);
    const cacheKey = `gaussianBlur|${ctx.textureFormat}`;

    if (!this.cachedLayout) {
      this.cachedLayout = this.bindGroupLayout(ctx);
    }
    const layout = this.cachedLayout;
    const pipeline = ctx.pipelineCache.getOrCreate(cacheKey, () =>
      this.createPipeline(ctx, layout),
    );

    this.horizontal = this.makePass(ctx, pipeline, layout, 1, 0, invTwoSigmaSq);
    this.vertical = this.makePass(ctx, pipeline, layout, 0, 1, invTwoSigmaSq);
  }

  execute(input: GPUTexture, output: GPUTexture, ctx: ExecutionContext): void {
    if (!this.horizontal || !this.vertical) {
      throw new PixflowError(
        ErrorCode.INTERNAL,
        'GaussianBlurFilter executed before prepare() completed.',
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
      label: 'pixflow.gaussianBlur.bg',
      layout: pass.bindGroupLayout,
      entries: [
        { binding: 0, resource: input.createView() },
        { binding: 1, resource: output.createView() },
        { binding: 2, resource: { buffer: pass.uniformBuffer } },
      ],
    });
    const enc = ctx.encoder.beginComputePass({ label: 'pixflow.gaussianBlur.pass' });
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
    invTwoSigmaSq: number,
  ): PreparedPass {
    const size = alignTo(UNIFORM_BYTES, 16);
    const buf = ctx.device.createBuffer({
      label: 'pixflow.gaussianBlur.uniforms',
      size,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const bytes = new ArrayBuffer(size);
    const view = new DataView(bytes);
    view.setFloat32(0, dirX, true);
    view.setFloat32(4, dirY, true);
    view.setFloat32(8, this.params.radius, true);
    view.setFloat32(12, invTwoSigmaSq, true);
    ctx.queue.writeBuffer(buf, 0, bytes);
    return { pipeline, bindGroupLayout: layout, uniformBuffer: buf };
  }

  private createPipeline(ctx: ExecutionContext, layout: GPUBindGroupLayout): GPUComputePipeline {
    const module = ctx.device.createShaderModule({
      label: 'pixflow.gaussianBlur.module',
      code: GAUSSIAN_BLUR_WGSL,
    });
    return ctx.device.createComputePipeline({
      label: 'pixflow.gaussianBlur.pipeline',
      layout: ctx.device.createPipelineLayout({ bindGroupLayouts: [layout] }),
      compute: { module, entryPoint: 'main' },
    });
  }

  private bindGroupLayout(ctx: ExecutionContext): GPUBindGroupLayout {
    return ctx.device.createBindGroupLayout({
      label: 'pixflow.gaussianBlur.bgl',
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
