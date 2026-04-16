import { ErrorCode, PixflowError } from '../errors.js';
import type { ExecutionContext, Filter, FilterPipeline } from '../types.js';

export const WORKGROUP_SIZE = 8;

export interface ComputeFilterShape<Params> {
  readonly name: string;
  readonly wgsl: string;
  readonly entryPoint?: string;
  readonly uniformByteLength: number;
  writeUniforms(view: DataView, params: Params): void;
  hashSuffix(params: Params): string;
}

export abstract class ComputeFilter<Params> implements Filter<Params> {
  readonly name: string;
  readonly params: Params;
  readonly stage = 'compute' as const;

  private prepared: FilterPipeline | null = null;
  private uniformBuffer: GPUBuffer | null = null;

  protected abstract readonly shape: ComputeFilterShape<Params>;

  constructor(name: string, params: Params) {
    this.name = name;
    this.params = params;
  }

  hash(): string {
    return `${this.name}|${this.shape.hashSuffix(this.params)}`;
  }

  async prepare(ctx: ExecutionContext): Promise<FilterPipeline> {
    if (this.prepared) return this.prepared;

    const cacheKey = this.hash();
    const cached = ctx.pipelineCache.get(cacheKey);
    const module = ctx.device.createShaderModule({
      label: `pixflow.${this.name}.module`,
      code: this.shape.wgsl,
    });

    const bindGroupLayout = ctx.device.createBindGroupLayout({
      label: `pixflow.${this.name}.bgl`,
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

    const pipeline =
      cached ??
      ctx.device.createComputePipeline({
        label: `pixflow.${this.name}.pipeline`,
        layout: ctx.device.createPipelineLayout({
          bindGroupLayouts: [bindGroupLayout],
        }),
        compute: {
          module,
          entryPoint: this.shape.entryPoint ?? 'main',
        },
      });

    ctx.pipelineCache.set(cacheKey, pipeline);

    if (this.shape.uniformByteLength > 0) {
      this.uniformBuffer = ctx.device.createBuffer({
        label: `pixflow.${this.name}.uniforms`,
        size: alignTo(this.shape.uniformByteLength, 16),
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      const bytes = new ArrayBuffer(alignTo(this.shape.uniformByteLength, 16));
      this.shape.writeUniforms(new DataView(bytes), this.params);
      ctx.queue.writeBuffer(this.uniformBuffer, 0, bytes);
    }

    this.prepared = { pipeline, bindGroupLayout };
    return this.prepared;
  }

  execute(input: GPUTexture, output: GPUTexture, ctx: ExecutionContext): void {
    if (!this.prepared || !this.uniformBuffer) {
      throw new PixflowError(
        ErrorCode.INTERNAL,
        `Filter "${this.name}" was executed before prepare() completed.`,
      );
    }

    const bindGroup = ctx.device.createBindGroup({
      label: `pixflow.${this.name}.bg`,
      layout: this.prepared.bindGroupLayout,
      entries: [
        { binding: 0, resource: input.createView() },
        { binding: 1, resource: output.createView() },
        { binding: 2, resource: { buffer: this.uniformBuffer } },
      ],
    });

    const pass = ctx.encoder.beginComputePass({ label: `pixflow.${this.name}.pass` });
    pass.setPipeline(this.prepared.pipeline);
    pass.setBindGroup(0, bindGroup);
    const groupsX = Math.ceil(output.width / WORKGROUP_SIZE);
    const groupsY = Math.ceil(output.height / WORKGROUP_SIZE);
    pass.dispatchWorkgroups(groupsX, groupsY, 1);
    pass.end();
  }
}

function alignTo(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}
