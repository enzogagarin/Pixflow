export type FilterStage = 'compute' | 'render' | 'cpu';

export interface ExecutionContext {
  readonly device: GPUDevice;
  readonly queue: GPUQueue;
  readonly encoder: GPUCommandEncoder;
  readonly pipelineCache: Map<string, GPUComputePipeline>;
  readonly textureFormat: GPUTextureFormat;
}

export interface FilterPipeline {
  readonly pipeline: GPUComputePipeline;
  readonly bindGroupLayout: GPUBindGroupLayout;
}

export interface Filter<Params = unknown> {
  readonly name: string;
  readonly params: Params;
  readonly stage: FilterStage;
  prepare(ctx: ExecutionContext): Promise<FilterPipeline>;
  execute(input: GPUTexture, output: GPUTexture, ctx: ExecutionContext): void;
  hash(): string;
}

export interface PipelineStats {
  readonly durationMs: number;
  readonly filterCount: number;
  readonly inputWidth: number;
  readonly inputHeight: number;
}

export interface PipelineResult {
  readonly blob: Blob;
  readonly width: number;
  readonly height: number;
  readonly stats: PipelineStats;
}

export type ImageSource = File | Blob | string | ImageBitmap | HTMLImageElement;

export interface EncodeOptions {
  readonly format?: 'image/png' | 'image/jpeg' | 'image/webp';
  readonly quality?: number;
}
