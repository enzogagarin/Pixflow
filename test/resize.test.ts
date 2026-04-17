import { describe, expect, it } from 'vitest';
import { computeResizedDims, ResizeFilter } from '../src/filters/resize.js';
import { computeStepDims } from '../src/pipeline/pipeline.js';
import { PixflowError } from '../src/errors.js';

describe('computeResizedDims (Sharp.js fit semantics)', () => {
  it('contain shrinks proportionally to fit inside the box', () => {
    expect(computeResizedDims({ width: 2000, height: 1000 }, { width: 800, height: 800, fit: 'contain' })).toEqual({
      width: 800,
      height: 400,
    });
    expect(computeResizedDims({ width: 1000, height: 2000 }, { width: 800, height: 800, fit: 'contain' })).toEqual({
      width: 400,
      height: 800,
    });
  });

  it('cover fills the box and may exceed in one dimension', () => {
    expect(computeResizedDims({ width: 2000, height: 1000 }, { width: 800, height: 800, fit: 'cover' })).toEqual({
      width: 1600,
      height: 800,
    });
  });

  it('fill stretches to exact dimensions', () => {
    expect(computeResizedDims({ width: 2000, height: 1000 }, { width: 800, height: 600, fit: 'fill' })).toEqual({
      width: 800,
      height: 600,
    });
  });

  it('inside fits within the box preserving aspect (same dims as contain)', () => {
    expect(computeResizedDims({ width: 1600, height: 1200 }, { width: 800, height: 800, fit: 'inside' })).toEqual({
      width: 800,
      height: 600,
    });
  });

  it('inside + withoutEnlargement preserves small input', () => {
    expect(
      computeResizedDims(
        { width: 200, height: 100 },
        { width: 800, height: 800, fit: 'inside', withoutEnlargement: true },
      ),
    ).toEqual({ width: 200, height: 100 });
  });

  it('outside ensures both dims meet/exceed the box', () => {
    expect(computeResizedDims({ width: 100, height: 100 }, { width: 800, height: 400, fit: 'outside' })).toEqual({
      width: 800,
      height: 800,
    });
  });

  it('width-only preserves aspect ratio', () => {
    expect(computeResizedDims({ width: 2000, height: 1500 }, { width: 800 })).toEqual({
      width: 800,
      height: 600,
    });
  });

  it('height-only preserves aspect ratio', () => {
    expect(computeResizedDims({ width: 2000, height: 1500 }, { height: 600 })).toEqual({
      width: 800,
      height: 600,
    });
  });

  it('withoutEnlargement clamps to input dims', () => {
    expect(
      computeResizedDims(
        { width: 100, height: 100 },
        { width: 800, height: 800, fit: 'cover', withoutEnlargement: true },
      ),
    ).toEqual({ width: 100, height: 100 });
  });
});

describe('ResizeFilter validation', () => {
  it('requires width or height', () => {
    expect(() => new ResizeFilter({})).toThrow(PixflowError);
  });

  it('rejects non-positive dimensions', () => {
    expect(() => new ResizeFilter({ width: 0 })).toThrow(PixflowError);
    expect(() => new ResizeFilter({ width: -10 })).toThrow(PixflowError);
    expect(() => new ResizeFilter({ height: Number.NaN })).toThrow(PixflowError);
  });

  it('hash differs across params and stays stable for equal params', () => {
    const a = new ResizeFilter({ width: 800, fit: 'contain' });
    const b = new ResizeFilter({ width: 800, fit: 'contain' });
    const c = new ResizeFilter({ width: 800, fit: 'cover' });
    expect(a.hash()).toBe(b.hash());
    expect(a.hash()).not.toBe(c.hash());
  });

  it('outputSize matches computeResizedDims', () => {
    const f = new ResizeFilter({ width: 400, height: 300, fit: 'cover' });
    const dims = f.outputSize({ width: 1600, height: 1200 });
    expect(dims).toEqual(computeResizedDims({ width: 1600, height: 1200 }, { width: 400, height: 300, fit: 'cover' }));
  });
});

describe('computeStepDims propagates dim changes through the pipeline', () => {
  it('resize → identity → resize chain', () => {
    const filters = [
      new ResizeFilter({ width: 800 }),
      new ResizeFilter({ width: 400, fit: 'cover' }),
    ];
    const dims = computeStepDims({ width: 2000, height: 1500 }, filters);
    expect(dims).toEqual([
      { width: 2000, height: 1500 },
      { width: 800, height: 600 },
      { width: 400, height: 300 },
    ]);
  });
});
