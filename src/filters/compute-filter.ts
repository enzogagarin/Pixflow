import { ErrorCode, PixflowError } from '../errors.js';
import type { Dims, ExecutionContext, Filter } from '../types.js';

export const WORKGROUP_SIZE = 8;

export interface ComputeFilterShape<Params> {
  readonly name: string;
  readonly wgsl: string;
  readonly entryPoint?: string;
  readonly uniformByteLength: number;
  writeUniforms(view: DataView, params: Params, inputDims: Dims, outputDims: Dims): void;
  hashSuffix(params: Params): string;
}

export abstract class ComputeFilter<Params> implements Filter<Params> {
  readonly name: string;
  readonly params: Params;
  readonly stage = 'compute' as const;

  private cachedLayout: GPUBindGroupLayout | null = null;
  private cachedPipeline: GPUComputePipeline | null = null;
  private uniformBuffer: GPUBuffer | null = null;
  private uniformSize = 0;

  protected abstract readonly shape: ComputeFilterShape<Params>;

  /**
   * When true, the pipeline treats execute() as a no-op identity pass and
   * skips scheduling it entirely. Subclasses set this for param values that
   * would produce a degenerate shader (e.g. brightness(0), contrast(0)).
   */
  get isIdentity(): boolean {
    return false;
  }

  constructor(name: string, params: Params) {
    this.name = name;
    this.params = params;
  }

  hash(): string {
    return `${this.name}|${this.shape.hashSuffix(this.params)}`;
  }

  async prepare(ctx: ExecutionContext, inputDims: Dims, outputDims: Dims): Promise<void> {
    if (!this.cachedLayout) {
      this.cachedLayout = this.bindGroupLayout(ctx);
    }
    const layout = this.cachedLayout;

    // Pipelines key on shader name + format only — multiple filter instances with
    // the same shader but different params share one compiled pipeline.
    const pipelineKey = `${this.shape.name}|${ctx.textureFormat}`;
    this.cachedPipeline = ctx.pipelineCache.getOrCreate(pipelineKey, () => {
      const module = ctx.device.createShaderModule({
        label: `pixflow.${this.name}.module`,
        code: this.shape.wgsl,
      });
      return ctx.device.createComputePipeline({
        label: `pixflow.${this.name}.pipeline`,
        layout: ctx.device.createPipelineLayout({ bindGroupLayouts: [layout] }),
        compute: { module, entryPoint: this.shape.entryPoint ?? 'main' },
      });
    });

    if (this.shape.uniformByteLength > 0) {
      const aligned = alignTo(this.shape.uniformByteLength, 16);
      // Reuse the buffer when the required size is the same or smaller — this
      // avoids leaking one uniform buffer per filter per run() in batch mode,
      // and keeps driver churn low.
      if (!this.uniformBuffer || this.uniformSize < aligned) {
        if (this.uniformBuffer) this.uniformBuffer.destroy();
        this.uniformBuffer = ctx.device.createBuffer({
          label: `pixflow.${this.name}.uniforms`,
          size: aligned,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this.uniformSize = aligned;
      }
      const bytes = new ArrayBuffer(aligned);
      this.shape.writeUniforms(new DataView(bytes), this.params, inputDims, outputDims);
      ctx.queue.writeBuffer(this.uniformBuffer, 0, bytes);
    }
  }

  execute(input: GPUTexture, output: GPUTexture, ctx: ExecutionContext): void {
    if (!this.cachedPipeline || !this.cachedLayout) {
      throw new PixflowError(
        ErrorCode.INTERNAL,
        `Filter "${this.name}" was executed before prepare() completed.`,
      );
    }

    const entries: GPUBindGroupEntry[] = [
      { binding: 0, resource: input.createView() },
      { binding: 1, resource: output.createView() },
    ];
    if (this.uniformBuffer) {
      entries.push({ binding: 2, resource: { buffer: this.uniformBuffer } });
    }

    const bindGroup = ctx.device.createBindGroup({
      label: `pixflow.${this.name}.bg`,
      layout: this.cachedLayout,
      entries,
    });

    const pass = ctx.encoder.beginComputePass({ label: `pixflow.${this.name}.pass` });
    pass.setPipeline(this.cachedPipeline);
    pass.setBindGroup(0, bindGroup);
    const groupsX = Math.ceil(output.width / WORKGROUP_SIZE);
    const groupsY = Math.ceil(output.height / WORKGROUP_SIZE);
    pass.dispatchWorkgroups(groupsX, groupsY, 1);
    pass.end();
  }

  /** Release any owned GPU resources. Safe to call multiple times. */
  dispose(): void {
    if (this.uniformBuffer) {
      this.uniformBuffer.destroy();
      this.uniformBuffer = null;
      this.uniformSize = 0;
    }
    this.cachedLayout = null;
    this.cachedPipeline = null;
  }

  private bindGroupLayout(ctx: ExecutionContext): GPUBindGroupLayout {
    const entries: GPUBindGroupLayoutEntry[] = [
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
    ];
    if (this.shape.uniformByteLength > 0) {
      entries.push({
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: 'uniform' },
      });
    }
    return ctx.device.createBindGroupLayout({
      label: `pixflow.${this.name}.bgl`,
      entries,
    });
  }
}

export function alignTo(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}
