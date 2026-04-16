import type { PipelineCacheLike } from '../types.js';

export class PipelineCache implements PipelineCacheLike {
  private readonly cache = new Map<string, GPUComputePipeline>();
  private hitCount = 0;
  private missCount = 0;

  has(key: string): boolean {
    return this.cache.has(key);
  }

  get(key: string): GPUComputePipeline | undefined {
    const v = this.cache.get(key);
    if (v) this.hitCount++;
    else this.missCount++;
    return v;
  }

  set(key: string, pipeline: GPUComputePipeline): void {
    this.cache.set(key, pipeline);
  }

  getOrCreate(key: string, factory: () => GPUComputePipeline): GPUComputePipeline {
    const existing = this.cache.get(key);
    if (existing) {
      this.hitCount++;
      return existing;
    }
    this.missCount++;
    const created = factory();
    this.cache.set(key, created);
    return created;
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  get hits(): number {
    return this.hitCount;
  }

  get misses(): number {
    return this.missCount;
  }
}
