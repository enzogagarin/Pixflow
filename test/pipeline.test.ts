import { describe, expect, it } from 'vitest';
import { computeStepDims, Pipeline } from '../src/pipeline/pipeline.js';
import { ResizeFilter } from '../src/filters/resize.js';
import { Rotate90Filter } from '../src/filters/rotate90.js';
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
