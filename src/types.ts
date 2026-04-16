export type FilterStage = 'compute' | 'render' | 'cpu';

export interface Dims {
  readonly width: number;
  readonly height: number;
}

export interface PipelineCacheLike {
  has(key: string): boolean;
  get(key: string): GPUComputePipeline | undefined;
  set(key: string, pipeline: GPUComputePipeline): void;
  getOrCreate(key: string, factory: () => GPUComputePipeline): GPUComputePipeline;
  readonly size: number;
}

export interface TexturePoolLike {
  acquire(width: number, height: number, format: GPUTextureFormat): GPUTexture;
  release(texture: GPUTexture): void;
  readonly stats: TexturePoolStats;
}

export interface TexturePoolStats {
  readonly allocations: number;
  readonly reuses: number;
  readonly available: number;
  readonly liveBuckets: number;
}

export interface ExecutionContext {
  readonly device: GPUDevice;
  readonly queue: GPUQueue;
  readonly encoder: GPUCommandEncoder;
  readonly pipelineCache: PipelineCacheLike;
  readonly texturePool: TexturePoolLike;
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
  prepare(ctx: ExecutionContext, inputDims: Dims, outputDims: Dims): Promise<void>;
  execute(input: GPUTexture, output: GPUTexture, ctx: ExecutionContext): void;
  hash(): string;
  outputSize?(inputDims: Dims): Dims;
}

export interface PipelineStats {
  readonly durationMs: number;
  readonly filterCount: number;
  readonly inputWidth: number;
  readonly inputHeight: number;
  readonly outputWidth: number;
  readonly outputHeight: number;
  readonly poolReuses: number;
  readonly poolAllocations: number;
  readonly cacheSize: number;
  /** Format the blob was actually encoded as (may differ from requested when AVIF falls back). */
  readonly format: EncodeFormat;
  /** Format the caller asked for when we had to fall back, otherwise undefined. */
  readonly requestedFormat?: EncodeFormat;
}

export interface PipelineResult {
  readonly blob: Blob;
  readonly width: number;
  readonly height: number;
  readonly stats: PipelineStats;
}

export type ImageSource = File | Blob | string | ImageBitmap | HTMLImageElement;

export type EncodeFormat = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/avif';

export interface EncodeOptions {
  readonly format?: EncodeFormat;
  readonly quality?: number;
}
