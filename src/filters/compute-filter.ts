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

  protected abstract readonly shape: ComputeFilterShape<Params>;

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
      if (!this.uniformBuffer || this.uniformBuffer.size < aligned) {
        this.uniformBuffer = ctx.device.createBuffer({
          label: `pixflow.${this.name}.uniforms`,
          size: aligned,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
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
