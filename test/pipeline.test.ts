import { describe, expect, it } from 'vitest';
import { computeStepDims, Pipeline } from '../src/pipeline/pipeline.js';
import { ResizeFilter } from '../src/filters/resize.js';
import { Rotate90Filter } from '../src/filters/rotate90.js';
import { AutoOrientFilter } from '../src/filters/auto-orient.js';
import { PixflowError } from '../src/errors.js';

describe('Pipeline builder', () => {
  it('creates an empty pipeline via Pipeline.create()', () => {
    const p = Pipeline.create();
    expect(p).toBeInstanceOf(Pipeline);
    expect(p.length).toBe(0);
  });

  it('chains brightness + contrast via fluent API', () => {
    const p = Pipeline.create().brightness(0.2).contrast(0.1);
    expect(p.length).toBe(2);
    const desc = p.describe();
    expect(desc[0]?.name).toBe('brightness');
    expect(desc[1]?.name).toBe('contrast');
  });

  it('supports the full Week 3-5 fluent API', () => {
    const p = Pipeline.create()
      .resize({ width: 800, fit: 'contain' })
      .saturation(0.2)
      .gaussianBlur(3)
      .unsharpMask({ amount: 0.5, radius: 1 })
      .rotate90(1)
      .flip('h')
      .pad({ top: 10, right: 10, bottom: 10, left: 10, color: { r: 1, g: 1, b: 1 } })
      .crop({ x: 0, y: 0, width: 100, height: 100 });
    expect(p.length).toBe(8);
  });

  it('chains the Week 5 color filters (curves, whiteBalance, colorMatrix)', () => {
    const p = Pipeline.create()
      .curves([
        [0, 0],
        [0.5, 0.6],
        [1, 1],
      ])
      .whiteBalance({ temperature: 0.2, tint: -0.05 })
      .colorMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    expect(p.length).toBe(3);
    expect(p.describe().map((d) => d.name)).toEqual([
      'curves',
      'whiteBalance',
      'colorMatrix',
    ]);
  });

  it('accepts either a number or a params object for shorthand filters', () => {
    const a = Pipeline.create().brightness(0.25);
    const b = Pipeline.create().brightness({ amount: 0.25 });
    expect(a.describe()[0]?.hash).toBe(b.describe()[0]?.hash);
  });

  it('throws INVALID_INPUT when .run() is called with no filters', async () => {
    const p = Pipeline.create();
    await expect(p.run(new Blob())).rejects.toBeInstanceOf(PixflowError);
  });

  it('orient(n) appends the EXIF orientation filters', () => {
    const p = Pipeline.create().orient(6);
    expect(p.describe().map((d) => d.name)).toEqual(['rotate90']);
  });

  it('rejects orient() with invalid orientation', () => {
    const p = Pipeline.create();
    expect(() => p.orient(99)).toThrow(PixflowError);
  });

  it('orient() with no argument inserts an AutoOrientFilter marker', () => {
    const p = Pipeline.create().resize({ width: 100 }).orient().brightness(0.1);
    const names = p.describe().map((d) => d.name);
    expect(names).toEqual(['resize', 'auto-orient', 'brightness']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filters = (p as any).filters as unknown[];
    expect(filters[1]).toBeInstanceOf(AutoOrientFilter);
  });

  it('encode() records pipeline-level defaults without adding a filter', () => {
    const p = Pipeline.create().brightness(0.1).encode({ format: 'image/webp', quality: 0.85 });
    expect(p.length).toBe(1);
    expect(p.describe().map((d) => d.name)).toEqual(['brightness']);
  });

  it('reset() clears filters and encode options but keeps the instance reusable', () => {
    const p = Pipeline.create()
      .brightness(0.1)
      .resize({ width: 100 })
      .encode({ format: 'image/webp' });
    expect(p.length).toBe(2);
    p.reset();
    expect(p.length).toBe(0);
    p.contrast(0.2);
    expect(p.length).toBe(1);
    expect(p.describe()[0]?.name).toBe('contrast');
  });
});

describe('AutoOrientFilter', () => {
  it('has a stable name, hash, and cpu stage', () => {
    const f = new AutoOrientFilter();
    expect(f.name).toBe('auto-orient');
    expect(f.stage).toBe('cpu');
    expect(f.hash()).toBe('auto-orient');
  });

  it('throws if prepare() or execute() is called directly', () => {
    const f = new AutoOrientFilter();
    expect(() => f.prepare()).toThrow(PixflowError);
    expect(() => f.execute()).toThrow(PixflowError);
  });
});

describe('computeStepDims', () => {
  it('chains a resize → rotate90 → resize correctly', () => {
    const filters = [
      new ResizeFilter({ width: 800, height: 600, fit: 'cover' }),
      new Rotate90Filter({ turns: 1 }),
      new ResizeFilter({ width: 400 }),
    ];
    const dims = computeStepDims({ width: 1600, height: 1200 }, filters);
    expect(dims).toEqual([
      { width: 1600, height: 1200 },
      { width: 800, height: 600 },
      { width: 600, height: 800 },
      { width: 400, height: 533 },
    ]);
  });
});
