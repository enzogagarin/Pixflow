import { describe, expect, it } from 'vitest';
import { TexturePool } from '../src/resources/texture-pool.js';
import { PixflowError } from '../src/errors.js';

interface FakeTexture {
  width: number;
  height: number;
  format: GPUTextureFormat;
  destroyed: boolean;
  destroy(): void;
}

interface FakeDevice {
  createTexture(desc: GPUTextureDescriptor): FakeTexture;
  createCount: number;
}

function fakeDevice(): FakeDevice {
  const dev: FakeDevice = {
    createCount: 0,
    createTexture(desc): FakeTexture {
      dev.createCount++;
      const size = desc.size as { width: number; height: number };
      const tex: FakeTexture = {
        width: size.width,
        height: size.height,
        format: desc.format,
        destroyed: false,
        destroy(): void {
          tex.destroyed = true;
        },
      };
      return tex;
    },
  };
  return dev;
}

describe('TexturePool', () => {
  it('allocates a new texture on first acquire of a bucket', () => {
    const dev = fakeDevice();
    const pool = new TexturePool({ device: dev as unknown as GPUDevice });
    const t = pool.acquire(100, 100, 'rgba8unorm') as unknown as FakeTexture;
    expect(t.width).toBe(100);
    expect(t.height).toBe(100);
    expect(dev.createCount).toBe(1);
    expect(pool.stats.allocations).toBe(1);
    expect(pool.stats.reuses).toBe(0);
  });

  it('reuses released textures from the same bucket', () => {
    const dev = fakeDevice();
    const pool = new TexturePool({ device: dev as unknown as GPUDevice });
    const a = pool.acquire(64, 64, 'rgba8unorm');
    pool.release(a as unknown as GPUTexture);
    const b = pool.acquire(64, 64, 'rgba8unorm');
    expect(b).toBe(a);
    expect(dev.createCount).toBe(1);
    expect(pool.stats.reuses).toBe(1);
  });

  it('keeps separate buckets per (width,height,format) combination', () => {
    const dev = fakeDevice();
    const pool = new TexturePool({ device: dev as unknown as GPUDevice });
    const a = pool.acquire(64, 64, 'rgba8unorm');
    const b = pool.acquire(64, 32, 'rgba8unorm');
    pool.release(a as unknown as GPUTexture);
    pool.release(b as unknown as GPUTexture);
    const c = pool.acquire(64, 32, 'rgba8unorm');
    expect(c).toBe(b);
  });

  it('supports stable ping-pong: 1000 cycles of acquire/release allocates only twice', () => {
    const dev = fakeDevice();
    const pool = new TexturePool({ device: dev as unknown as GPUDevice });
    let prev = pool.acquire(128, 128, 'rgba8unorm');
    for (let i = 0; i < 1000; i++) {
      const next = pool.acquire(128, 128, 'rgba8unorm');
      pool.release(prev as unknown as GPUTexture);
      prev = next;
    }
    pool.release(prev as unknown as GPUTexture);
    expect(dev.createCount).toBe(2);
    expect(pool.stats.allocations).toBe(2);
  });

  it('rejects invalid dimensions', () => {
    const dev = fakeDevice();
    const pool = new TexturePool({ device: dev as unknown as GPUDevice });
    expect(() => pool.acquire(0, 100, 'rgba8unorm')).toThrow(PixflowError);
    expect(() => pool.acquire(100, -1, 'rgba8unorm')).toThrow(PixflowError);
  });

  it('caps bucket size and destroys excess released textures', () => {
    const dev = fakeDevice();
    const pool = new TexturePool({
      device: dev as unknown as GPUDevice,
      maxBucketSize: 2,
    });
    const a = pool.acquire(32, 32, 'rgba8unorm') as unknown as FakeTexture;
    const b = pool.acquire(32, 32, 'rgba8unorm') as unknown as FakeTexture;
    const c = pool.acquire(32, 32, 'rgba8unorm') as unknown as FakeTexture;
    pool.release(a as unknown as GPUTexture);
    pool.release(b as unknown as GPUTexture);
    pool.release(c as unknown as GPUTexture);
    expect(c.destroyed).toBe(true);
    expect(a.destroyed).toBe(false);
    expect(b.destroyed).toBe(false);
  });

  it('dispose destroys all pooled textures and rejects further acquires', () => {
    const dev = fakeDevice();
    const pool = new TexturePool({ device: dev as unknown as GPUDevice });
    const a = pool.acquire(8, 8, 'rgba8unorm') as unknown as FakeTexture;
    pool.release(a as unknown as GPUTexture);
    pool.dispose();
    expect(a.destroyed).toBe(true);
    expect(() => pool.acquire(8, 8, 'rgba8unorm')).toThrow(PixflowError);
  });
});
