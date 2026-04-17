import { describe, expect, it } from 'vitest';
import { PixelateFilter, type Region } from '../src/filters/pixelate.js';
import { RegionBlurFilter } from '../src/filters/region-blur.js';
import { PixflowError } from '../src/errors.js';

const R: Region = { x: 10, y: 20, w: 80, h: 60 };

describe('PixelateFilter', () => {
  it('stores params and exposes name/stage', () => {
    const f = new PixelateFilter({ regions: [R], blockSize: 8 });
    expect(f.name).toBe('pixelate');
    expect(f.stage).toBe('compute');
    expect(f.params.regions).toHaveLength(1);
    expect(f.params.blockSize).toBe(8);
  });

  it('produces a deterministic hash for identical params', () => {
    const a = new PixelateFilter({ regions: [R], blockSize: 8 });
    const b = new PixelateFilter({ regions: [R], blockSize: 8 });
    expect(a.hash()).toBe(b.hash());
  });

  it('produces different hashes when params differ', () => {
    const a = new PixelateFilter({ regions: [R], blockSize: 8 });
    const b = new PixelateFilter({ regions: [R], blockSize: 16 });
    const c = new PixelateFilter({ regions: [{ ...R, x: 11 }], blockSize: 8 });
    expect(a.hash()).not.toBe(b.hash());
    expect(a.hash()).not.toBe(c.hash());
  });

  it('is identity when regions are empty', () => {
    const f = new PixelateFilter({ regions: [], blockSize: 8 });
    expect(f.isIdentity).toBe(true);
  });

  it('preserves output dimensions', () => {
    const f = new PixelateFilter({ regions: [R], blockSize: 8 });
    expect(f.outputSize?.({ width: 640, height: 480 })).toEqual({
      width: 640,
      height: 480,
    });
  });

  it('rejects blockSize outside [2, 256]', () => {
    expect(() => new PixelateFilter({ regions: [R], blockSize: 1 })).toThrow(PixflowError);
    expect(() => new PixelateFilter({ regions: [R], blockSize: 257 })).toThrow(PixflowError);
    expect(() => new PixelateFilter({ regions: [R], blockSize: 1.5 })).toThrow(PixflowError);
    expect(() => new PixelateFilter({ regions: [R], blockSize: Number.NaN })).toThrow(PixflowError);
  });

  it('rejects more than 16 regions', () => {
    const many: Region[] = Array.from({ length: 17 }, (_, i) => ({ x: i, y: 0, w: 5, h: 5 }));
    expect(() => new PixelateFilter({ regions: many, blockSize: 8 })).toThrow(PixflowError);
  });

  it('rejects regions with non-finite or non-positive dimensions', () => {
    expect(() =>
      new PixelateFilter({ regions: [{ x: 0, y: 0, w: 0, h: 10 }], blockSize: 8 }),
    ).toThrow(PixflowError);
    expect(() =>
      new PixelateFilter({ regions: [{ x: 0, y: 0, w: 10, h: -1 }], blockSize: 8 }),
    ).toThrow(PixflowError);
    expect(() =>
      new PixelateFilter({
        regions: [{ x: Number.NaN, y: 0, w: 10, h: 10 }],
        blockSize: 8,
      }),
    ).toThrow(PixflowError);
  });
});

describe('RegionBlurFilter', () => {
  it('stores params and exposes name/stage', () => {
    const f = new RegionBlurFilter({ regions: [R], sigma: 4 });
    expect(f.name).toBe('regionBlur');
    expect(f.stage).toBe('compute');
    expect(f.params.sigma).toBe(4);
  });

  it('produces a deterministic hash for identical params', () => {
    const a = new RegionBlurFilter({ regions: [R], sigma: 4 });
    const b = new RegionBlurFilter({ regions: [R], sigma: 4 });
    expect(a.hash()).toBe(b.hash());
  });

  it('produces different hashes when sigma or regions differ', () => {
    const base = new RegionBlurFilter({ regions: [R], sigma: 4 });
    const bySigma = new RegionBlurFilter({ regions: [R], sigma: 5 });
    const byRegion = new RegionBlurFilter({ regions: [{ ...R, x: 11 }], sigma: 4 });
    expect(base.hash()).not.toBe(bySigma.hash());
    expect(base.hash()).not.toBe(byRegion.hash());
  });

  it('has a hash distinct from PixelateFilter even with overlapping fields', () => {
    const p = new PixelateFilter({ regions: [R], blockSize: 8 });
    const b = new RegionBlurFilter({ regions: [R], sigma: 4 });
    expect(p.hash()).not.toBe(b.hash());
  });

  it('is identity when regions are empty', () => {
    const f = new RegionBlurFilter({ regions: [], sigma: 4 });
    expect(f.isIdentity).toBe(true);
  });

  it('preserves output dimensions', () => {
    const f = new RegionBlurFilter({ regions: [R], sigma: 4 });
    expect(f.outputSize?.({ width: 640, height: 480 })).toEqual({
      width: 640,
      height: 480,
    });
  });

  it('rejects sigma outside (0, 32]', () => {
    expect(() => new RegionBlurFilter({ regions: [R], sigma: 0 })).toThrow(PixflowError);
    expect(() => new RegionBlurFilter({ regions: [R], sigma: -1 })).toThrow(PixflowError);
    expect(() => new RegionBlurFilter({ regions: [R], sigma: 33 })).toThrow(PixflowError);
    expect(() => new RegionBlurFilter({ regions: [R], sigma: Number.NaN })).toThrow(PixflowError);
  });

  it('rejects more than 16 regions', () => {
    const many = Array.from({ length: 17 }, (_, i) => ({ x: i, y: 0, w: 5, h: 5 }));
    expect(() => new RegionBlurFilter({ regions: many, sigma: 4 })).toThrow(PixflowError);
  });

  it('rejects regions with non-positive dimensions', () => {
    expect(() =>
      new RegionBlurFilter({ regions: [{ x: 0, y: 0, w: 10, h: 0 }], sigma: 4 }),
    ).toThrow(PixflowError);
  });
});
