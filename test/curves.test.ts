import { describe, expect, it } from 'vitest';
import { CurvesFilter, buildLut } from '../src/filters/curves.js';
import { PixflowError } from '../src/errors.js';

describe('buildLut', () => {
  it('produces an identity ramp when given (0,0) and (1,1)', () => {
    const lut = buildLut([
      [0, 0],
      [1, 1],
    ]);
    expect(lut.length).toBe(256);
    expect(lut[0]).toBeCloseTo(0, 5);
    expect(lut[255]).toBeCloseTo(1, 5);
    expect(lut[128]).toBeCloseTo(128 / 255, 3);
  });

  it('clamps output values to [0, 1]', () => {
    const lut = buildLut([
      [0, 0],
      [1, 1],
    ]);
    for (const v of lut) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('interpolates linearly through interior knee points', () => {
    // Pin the midpoint to 0.75 — entries near 0 and 1 should still be at the
    // identity, but the middle should be lifted.
    const lut = buildLut([
      [0, 0],
      [0.5, 0.75],
      [1, 1],
    ]);
    expect(lut[127]).toBeCloseTo(0.75, 1);
    expect(lut[0]).toBeCloseTo(0, 3);
    expect(lut[255]).toBeCloseTo(1, 3);
  });

  it('synthesizes endpoints when the caller omits them', () => {
    const lut = buildLut([[0.5, 0.5]]);
    expect(lut[0]).toBeCloseTo(0.5, 3);
    expect(lut[255]).toBeCloseTo(0.5, 3);
  });

  it('produces a flat LUT for a single all-ones output', () => {
    const lut = buildLut([
      [0, 1],
      [1, 1],
    ]);
    for (const v of lut) expect(v).toBeCloseTo(1, 5);
  });
});

describe('CurvesFilter', () => {
  it('rejects empty point sets', () => {
    expect(() => new CurvesFilter({ points: [] })).toThrow(PixflowError);
  });

  it('rejects malformed tuples', () => {
    // @ts-expect-error -- intentionally invalid for test
    expect(() => new CurvesFilter({ points: [[0]] })).toThrow(PixflowError);
  });

  it('rejects out-of-range coordinates', () => {
    expect(() => new CurvesFilter({ points: [[-0.1, 0]] })).toThrow(PixflowError);
    expect(() => new CurvesFilter({ points: [[0, 1.1]] })).toThrow(PixflowError);
    expect(() => new CurvesFilter({ points: [[Number.NaN, 0]] })).toThrow(PixflowError);
  });

  it('exposes the expected name/stage', () => {
    const f = new CurvesFilter({
      points: [
        [0, 0],
        [1, 1],
      ],
    });
    expect(f.name).toBe('curves');
    expect(f.stage).toBe('compute');
  });

  it('hashes equal curves identically and unequal curves distinctly', () => {
    const a = new CurvesFilter({
      points: [
        [0, 0],
        [1, 1],
      ],
    });
    const b = new CurvesFilter({
      points: [
        [1, 1],
        [0, 0],
      ],
    });
    const c = new CurvesFilter({
      points: [
        [0, 0],
        [0.5, 0.7],
        [1, 1],
      ],
    });
    expect(a.hash()).toBe(b.hash());
    expect(a.hash()).not.toBe(c.hash());
  });
});
