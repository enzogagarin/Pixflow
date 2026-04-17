import { ErrorCode, PixflowError } from '../errors.js';
import type { TexturePoolLike, TexturePoolStats } from '../types.js';

// Hardcoded usage bitmask matching the WebGPU spec values for
// TEXTURE_BINDING (0x04) | STORAGE_BINDING (0x08) | COPY_SRC (0x01) | COPY_DST (0x02).
// Defined as a literal so the module can be imported in Node test environments
// where the GPUTextureUsage global is not defined.
const DEFAULT_USAGE: GPUTextureUsageFlags = 0x04 | 0x08 | 0x01 | 0x02;
const DEFAULT_MAX_MEMORY_MB = 256;

export interface TexturePoolOptions {
  readonly device: GPUDevice;
  readonly usage?: GPUTextureUsageFlags;
  readonly maxBucketSize?: number;
  /**
   * Soft cap on pooled (idle) texture memory in megabytes. Once the idle pool
   * exceeds this limit, releases destroy the texture instead of pooling it.
   * Default 256 MB.
   */
  readonly maxMemoryMB?: number;
}

export class TexturePool implements TexturePoolLike {
  private readonly device: GPUDevice;
  private readonly usage: GPUTextureUsageFlags;
  private readonly maxBucketSize: number;
  private readonly maxMemoryBytes: number;
  private readonly buckets = new Map<string, GPUTexture[]>();
  private readonly liveTextures = new WeakSet<GPUTexture>();

  private allocationCount = 0;
  private reuseCount = 0;
  private releaseCount = 0;
  private pooledBytes = 0;
  private disposed = false;

  constructor(options: TexturePoolOptions) {
    this.device = options.device;
    this.usage = options.usage ?? DEFAULT_USAGE;
    this.maxBucketSize = options.maxBucketSize ?? 8;
    const maxMb = options.maxMemoryMB ?? DEFAULT_MAX_MEMORY_MB;
    this.maxMemoryBytes = Math.max(0, maxMb) * 1024 * 1024;
  }

  acquire(width: number, height: number, format: GPUTextureFormat): GPUTexture {
    if (this.disposed) {
      throw new PixflowError(ErrorCode.INTERNAL, 'TexturePool used after dispose().');
    }
    if (width <= 0 || height <= 0) {
      throw new PixflowError(
        ErrorCode.INVALID_INPUT,
        `TexturePool.acquire requires positive dimensions; got ${width.toString()}x${height.toString()}.`,
      );
    }
    const key = bucketKey(width, height, format);
    const bucket = this.buckets.get(key);
    if (bucket && bucket.length > 0) {
      const tex = bucket.pop();
      if (tex) {
        this.reuseCount++;
        this.pooledBytes -= estimateBytes(width, height, format);
        this.liveTextures.add(tex);
        return tex;
      }
    }
    const tex = this.device.createTexture({
      label: `pixflow.pool.${key}`,
      size: { width, height, depthOrArrayLayers: 1 },
      format,
      usage: this.usage,
    });
    this.allocationCount++;
    this.liveTextures.add(tex);
    return tex;
  }

  release(texture: GPUTexture): void {
    if (this.disposed) return;
    if (!this.liveTextures.has(texture)) {
      return;
    }
    this.liveTextures.delete(texture);
    const bytes = estimateBytes(texture.width, texture.height, texture.format);

    // Aggressive eviction path: bucket is full OR pooling this would exceed
    // the memory budget. In either case destroy instead of pooling.
    if (this.pooledBytes + bytes > this.maxMemoryBytes) {
      this.evictIdleUntilFits(bytes);
      if (this.pooledBytes + bytes > this.maxMemoryBytes) {
        texture.destroy();
        return;
      }
    }

    const key = bucketKey(texture.width, texture.height, texture.format);
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = [];
      this.buckets.set(key, bucket);
    }
    if (bucket.length >= this.maxBucketSize) {
      texture.destroy();
      return;
    }
    bucket.push(texture);
    this.pooledBytes += bytes;
    this.releaseCount++;
  }

  /**
   * Walk buckets destroying the largest idle textures until the new incoming
   * allocation fits under the memory cap. Keeps hot (recently reused) buckets
   * by preferring to trim the oldest entries first.
   */
  private evictIdleUntilFits(incomingBytes: number): void {
    for (const [key, bucket] of this.buckets) {
      while (bucket.length > 0 && this.pooledBytes + incomingBytes > this.maxMemoryBytes) {
        const tex = bucket.shift();
        if (!tex) break;
        this.pooledBytes -= estimateBytes(tex.width, tex.height, tex.format);
        tex.destroy();
      }
      if (bucket.length === 0) this.buckets.delete(key);
      if (this.pooledBytes + incomingBytes <= this.maxMemoryBytes) return;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    for (const bucket of this.buckets.values()) {
      for (const tex of bucket) tex.destroy();
      bucket.length = 0;
    }
    this.buckets.clear();
    this.pooledBytes = 0;
    this.disposed = true;
  }

  get stats(): TexturePoolStats {
    let available = 0;
    for (const b of this.buckets.values()) available += b.length;
    return {
      allocations: this.allocationCount,
      reuses: this.reuseCount,
      available,
      liveBuckets: this.buckets.size,
    };
  }

  get released(): number {
    return this.releaseCount;
  }

  get pooledMemoryBytes(): number {
    return this.pooledBytes;
  }
}

function bucketKey(width: number, height: number, format: GPUTextureFormat): string {
  return `${width.toString()}x${height.toString()}x${format}`;
}

// Byte-per-pixel table for the formats pixflow actually emits. Anything else
// falls back to 4 (rgba8unorm-class). We only use this for rough accounting.
function bytesPerPixel(format: GPUTextureFormat): number {
  switch (format) {
    case 'rgba16float':
    case 'rg32float':
      return 8;
    case 'rgba32float':
      return 16;
    case 'r8unorm':
      return 1;
    case 'rg8unorm':
    case 'r16float':
      return 2;
    default:
      return 4;
  }
}

function estimateBytes(width: number, height: number, format: GPUTextureFormat): number {
  return width * height * bytesPerPixel(format);
}
