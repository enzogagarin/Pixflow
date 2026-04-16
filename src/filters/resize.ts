import { ErrorCode, PixflowError } from '../errors.js';
import { LANCZOS_WGSL } from '../shaders/lanczos.wgsl.js';
import type { Dims, ExecutionContext, Filter } from '../types.js';
import { WORKGROUP_SIZE, alignTo } from './compute-filter.js';

export type ResizeFit = 'contain' | 'cover' | 'fill' | 'inside' | 'outside';

export interface ResizeParams {
  readonly width?: number;
  readonly height?: number;
  readonly fit?: ResizeFit;
  /** Disable enlargement; if true and target is bigger than input, no-op for that dimension. */
  readonly withoutEnlargement?: boolean;
  /** Disable reduction; if true and target is smaller than input, no-op for that dimension. */
  readonly withoutReduction?: boolean;
}

const LANCZOS_A = 3;
// vec2f axis, vec2f in_size, vec2f out_size, ratio, scale, support, taps
const UNIFORM_BYTES = 8 + 8 + 8 + 4 + 4 + 4 + 4;

interface PreparedPass {
  readonly pipeline: GPUComputePipeline;
  readonly bindGroupLayout: GPUBindGroupLayout;
  readonly uniformBuffer: GPUBuffer;
}

export class ResizeFilter implements Filter<ResizeParams> {
  readonly name = 'resize';
  readonly stage = 'compute' as const;
  readonly params: ResizeParams;

  private targetDims: Dims | null = null;
  private sourceDims: Dims | null = null;
  private horizontalPass: PreparedPass | null = null;
  private verticalPass: PreparedPass | null = null;
  private cachedLayout: GPUBindGroupLayout | null = null;

  constructor(params: ResizeParams) {
    if (params.width === undefined && params.height === undefined) {
      throw new PixflowError(
        ErrorCode.INVALID_INPUT,
        'resize requires at least one of width or height.',
      );
    }
    if (params.width !== undefined && (!Number.isFinite(params.width) || params.width <= 0)) {
      throw new PixflowError(
        ErrorCode.INVALID_INPUT,
        `resize.width must be a positive finite number; got ${String(params.width)}.`,
      );
    }
    if (params.height !== undefined && (!Number.isFinite(params.height) || params.height <= 0)) {
      throw new PixflowError(
        ErrorCode.INVALID_INPUT,
        `resize.height must be a positive finite number; got ${String(params.height)}.`,
      );
    }
    this.params = params;
  }

  hash(): string {
    return `resize|w=${this.params.width ?? 'auto'}|h=${this.params.height ?? 'auto'}|fit=${this.params.fit ?? 'cover'}|nE=${this.params.withoutEnlargement ?? false}|nR=${this.params.withoutReduction ?? false}`;
  }

  outputSize(input: Dims): Dims {
    return computeResizedDims(input, this.params);
  }

  async prepare(ctx: ExecutionContext, input: Dims, output: Dims): Promise<void> {
    this.sourceDims = input;
    this.targetDims = output;
    if (!this.cachedLayout) {
      this.cachedLayout = this.bindGroupLayout(ctx);
    }
    const layout = this.cachedLayout;
    const pipeline = ctx.pipelineCache.getOrCreate(`resize.lanczos|${ctx.textureFormat}`, () => {
      const module = ctx.device.createShaderModule({
        label: 'pixflow.resize.module',
        code: LANCZOS_WGSL,
      });
      return ctx.device.createComputePipeline({
        label: 'pixflow.resize.pipeline',
        layout: ctx.device.createPipelineLayout({ bindGroupLayouts: [layout] }),
        compute: { module, entryPoint: 'main' },
      });
    });
    this.horizontalPass = this.makePass(
      ctx,
      pipeline,
      layout,
      [1, 0],
      input,
      { width: output.width, height: input.height },
      input.width,
      output.width,
    );
    this.verticalPass = this.makePass(
      ctx,
      pipeline,
      layout,
      [0, 1],
      { width: output.width, height: input.height },
      output,
      input.height,
      output.height,
    );
  }

  execute(input: GPUTexture, output: GPUTexture, ctx: ExecutionContext): void {
    if (!this.horizontalPass || !this.verticalPass || !this.targetDims || !this.sourceDims) {
      throw new PixflowError(ErrorCode.INTERNAL, 'ResizeFilter not prepared.');
    }
    const intermediate = ctx.texturePool.acquire(
      this.targetDims.width,
      this.sourceDims.height,
      ctx.textureFormat,
    );

    this.runPass(this.horizontalPass, input, intermediate, ctx);
    this.runPass(this.verticalPass, intermediate, output, ctx);

    ctx.texturePool.release(intermediate);
  }

  private runPass(
    pass: PreparedPass,
    input: GPUTexture,
    output: GPUTexture,
    ctx: ExecutionContext,
  ): void {
    const bg = ctx.device.createBindGroup({
      label: 'pixflow.resize.bg',
      layout: pass.bindGroupLayout,
      entries: [
        { binding: 0, resource: input.createView() },
        { binding: 1, resource: output.createView() },
        { binding: 2, resource: { buffer: pass.uniformBuffer } },
      ],
    });
    const enc = ctx.encoder.beginComputePass({ label: 'pixflow.resize.pass' });
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
    axis: [number, number],
    inDims: Dims,
    outDims: Dims,
    inAxis: number,
    outAxis: number,
  ): PreparedPass {
    const ratio = inAxis / outAxis;
    const scale = Math.max(ratio, 1);
    const support = LANCZOS_A * scale;
    const taps = Math.max(2, Math.ceil(support * 2));

    const size = alignTo(UNIFORM_BYTES, 16);
    const buf = ctx.device.createBuffer({
      label: 'pixflow.resize.uniforms',
      size,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const bytes = new ArrayBuffer(size);
    const view = new DataView(bytes);
    view.setFloat32(0, axis[0], true);
    view.setFloat32(4, axis[1], true);
    view.setFloat32(8, inDims.width, true);
    view.setFloat32(12, inDims.height, true);
    view.setFloat32(16, outDims.width, true);
    view.setFloat32(20, outDims.height, true);
    view.setFloat32(24, ratio, true);
    view.setFloat32(28, scale, true);
    view.setFloat32(32, support, true);
    view.setFloat32(36, taps, true);
    ctx.queue.writeBuffer(buf, 0, bytes);

    return { pipeline, bindGroupLayout: layout, uniformBuffer: buf };
  }

  private bindGroupLayout(ctx: ExecutionContext): GPUBindGroupLayout {
    return ctx.device.createBindGroupLayout({
      label: 'pixflow.resize.bgl',
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

/**
 * Sharp.js-compatible fit-mode dimension computation.
 *
 * - contain: fit inside box, preserve aspect, may produce smaller output
 * - cover:   fill the box, preserve aspect, may crop (we don't crop here, just size)
 * - fill:    stretch to box, ignore aspect
 * - inside:  preserve aspect, never enlarge beyond box
 * - outside: preserve aspect, ensure both dims >= box
 */
export function computeResizedDims(input: Dims, params: ResizeParams): Dims {
  const fit = params.fit ?? 'cover';
  const targetW = params.width;
  const targetH = params.height;

  if (targetW === undefined && targetH === undefined) {
    return input;
  }

  // Aspect math divides by input dims; a zero-sized source would yield NaN.
  // We treat it as a 1x1 input so the pipeline can still produce a valid
  // (clamped) output instead of silently corrupting downstream filters.
  if (input.width <= 0 || input.height <= 0) {
    return { width: Math.max(1, targetW ?? 1), height: Math.max(1, targetH ?? 1) };
  }

  let outW: number;
  let outH: number;

  if (fit === 'fill') {
    outW = targetW ?? input.width;
    outH = targetH ?? input.height;
  } else if (targetW !== undefined && targetH === undefined) {
    outW = targetW;
    outH = Math.round((input.height * targetW) / input.width);
  } else if (targetH !== undefined && targetW === undefined) {
    outH = targetH;
    outW = Math.round((input.width * targetH) / input.height);
  } else {
    const tw = targetW!;
    const th = targetH!;
    const ratioIn = input.width / input.height;
    const ratioBox = tw / th;
    if (fit === 'contain' || fit === 'inside') {
      if (ratioIn > ratioBox) {
        outW = tw;
        outH = Math.round(tw / ratioIn);
      } else {
        outH = th;
        outW = Math.round(th * ratioIn);
      }
    } else if (fit === 'cover' || fit === 'outside') {
      if (ratioIn > ratioBox) {
        outH = th;
        outW = Math.round(th * ratioIn);
      } else {
        outW = tw;
        outH = Math.round(tw / ratioIn);
      }
    } else {
      outW = tw;
      outH = th;
    }
  }

  if (params.withoutEnlargement) {
    if (outW > input.width) {
      const scale = input.width / outW;
      outW = input.width;
      outH = Math.round(outH * scale);
    }
    if (outH > input.height) {
      const scale = input.height / outH;
      outH = input.height;
      outW = Math.round(outW * scale);
    }
  }
  if (params.withoutReduction) {
    if (outW < input.width) {
      const scale = input.width / outW;
      outW = input.width;
      outH = Math.round(outH * scale);
    }
    if (outH < input.height) {
      const scale = input.height / outH;
      outH = input.height;
      outW = Math.round(outW * scale);
    }
  }
  if (fit === 'inside') {
    if (outW > (targetW ?? Infinity) || outH > (targetH ?? Infinity)) {
      const sx = targetW !== undefined ? targetW / outW : Infinity;
      const sy = targetH !== undefined ? targetH / outH : Infinity;
      const s = Math.min(sx, sy);
      outW = Math.round(outW * s);
      outH = Math.round(outH * s);
    }
  }
  if (fit === 'outside') {
    if (outW < (targetW ?? -Infinity) || outH < (targetH ?? -Infinity)) {
      const sx = targetW !== undefined ? targetW / outW : -Infinity;
      const sy = targetH !== undefined ? targetH / outH : -Infinity;
      const s = Math.max(sx, sy);
      outW = Math.round(outW * s);
      outH = Math.round(outH * s);
    }
  }

  return { width: Math.max(1, outW), height: Math.max(1, outH) };
}
