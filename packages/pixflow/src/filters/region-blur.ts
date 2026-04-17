import { ErrorCode, PixflowError } from '../errors.js';
import { REGION_BLUR_WGSL } from '../shaders/region-blur.wgsl.js';
import type { Dims, ExecutionContext, Filter } from '../types.js';
import { WORKGROUP_SIZE, alignTo } from './compute-filter.js';
import { MAX_REGIONS, type Region, validateRegions } from './pixelate.js';

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
    view.setUint32(0, this.params.regions.length, true);
    // Pass-params (16 bytes) at offset 16: direction.xy (f32, f32), radius f32, invTwoSigmaSq f32.
    view.setFloat32(16, dirX, true);
    view.setFloat32(20, dirY, true);
    view.setFloat32(24, radius, true);
    view.setFloat32(28, invTwoSigmaSq, true);
    // Regions array starts at offset 32 (vec4i × MAX_REGIONS).
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
