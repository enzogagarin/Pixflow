import { ErrorCode, PixflowError } from '../errors.js';
import type { TexturePoolLike, TexturePoolStats } from '../types.js';

// Hardcoded usage bitmask matching the WebGPU spec values for
// TEXTURE_BINDING (0x04) | STORAGE_BINDING (0x08) | COPY_SRC (0x01) | COPY_DST (0x02).
// Defined as a literal so the module can be imported in Node test environments
// where the GPUTextureUsage global is not defined.
const DEFAULT_USAGE: GPUTextureUsageFlags = 0x04 | 0x08 | 0x01 | 0x02;

export interface TexturePoolOptions {
  readonly device: GPUDevice;
  readonly usage?: GPUTextureUsageFlags;
  readonly maxBucketSize?: number;
}

export class TexturePool implements TexturePoolLike {
  private readonly device: GPUDevice;
  private readonly usage: GPUTextureUsageFlags;
  private readonly maxBucketSize: number;
  private readonly buckets = new Map<string, GPUTexture[]>();
  private readonly liveTextures = new WeakSet<GPUTexture>();

  private allocationCount = 0;
  private reuseCount = 0;
  private releaseCount = 0;
  private disposed = false;

  constructor(options: TexturePoolOptions) {
    this.device = options.device;
    this.usage = options.usage ?? DEFAULT_USAGE;
    this.maxBucketSize = options.maxBucketSize ?? 8;
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
    this.releaseCount++;
  }

  dispose(): void {
    if (this.disposed) return;
    for (const bucket of this.buckets.values()) {
      for (const tex of bucket) tex.destroy();
    }
    this.buckets.clear();
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
}

function bucketKey(width: number, height: number, format: GPUTextureFormat): string {
  return `${width.toString()}x${height.toString()}x${format}`;
}
