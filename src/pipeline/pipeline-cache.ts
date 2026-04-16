import type { PipelineCacheLike } from '../types.js';

export interface PipelineCacheOptions {
  /** Maximum number of entries before LRU eviction kicks in. Default 64. */
  readonly maxEntries?: number;
}

const DEFAULT_MAX_ENTRIES = 64;

/**
 * LRU-bounded GPU compute pipeline cache. The underlying Map preserves
 * insertion order, which we exploit to implement least-recently-used eviction
 * in O(1): every read re-inserts the entry so the oldest key is always first.
 */
export class PipelineCache implements PipelineCacheLike {
  private readonly cache = new Map<string, GPUComputePipeline>();
  private readonly maxEntries: number;
  private hitCount = 0;
  private missCount = 0;
  private evictionCount = 0;

  constructor(options: PipelineCacheOptions = {}) {
    this.maxEntries = Math.max(1, options.maxEntries ?? DEFAULT_MAX_ENTRIES);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  get(key: string): GPUComputePipeline | undefined {
    const v = this.cache.get(key);
    if (v) {
      this.hitCount++;
      this.cache.delete(key);
      this.cache.set(key, v);
    } else {
      this.missCount++;
    }
    return v;
  }

  set(key: string, pipeline: GPUComputePipeline): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    this.cache.set(key, pipeline);
    this.evictIfNeeded();
  }

  getOrCreate(key: string, factory: () => GPUComputePipeline): GPUComputePipeline {
    const existing = this.cache.get(key);
    if (existing) {
      this.hitCount++;
      this.cache.delete(key);
      this.cache.set(key, existing);
      return existing;
    }
    this.missCount++;
    const created = factory();
    this.cache.set(key, created);
    this.evictIfNeeded();
    return created;
  }

  clear(): void {
    this.cache.clear();
  }

  private evictIfNeeded(): void {
    while (this.cache.size > this.maxEntries) {
      const oldest = this.cache.keys().next();
      if (oldest.done) break;
      this.cache.delete(oldest.value);
      this.evictionCount++;
    }
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

  get evictions(): number {
    return this.evictionCount;
  }
}
