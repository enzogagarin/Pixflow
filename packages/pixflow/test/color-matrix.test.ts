import { describe, expect, it } from 'vitest';
import {
  ColorMatrixFilter,
  GRAYSCALE_MATRIX,
  IDENTITY_MATRIX,
  SEPIA_MATRIX,
} from '../src/filters/color-matrix.js';
import { PixflowError } from '../src/errors.js';

describe('ColorMatrixFilter', () => {
  it('accepts the identity matrix', () => {
    const f = new ColorMatrixFilter({ matrix: [...IDENTITY_MATRIX] });
    expect(f.name).toBe('colorMatrix');
    expect(f.stage).toBe('compute');
  });

  it('accepts grayscale and sepia presets', () => {
    expect(() => new ColorMatrixFilter({ matrix: [...GRAYSCALE_MATRIX] })).not.toThrow();
    expect(() => new ColorMatrixFilter({ matrix: [...SEPIA_MATRIX] })).not.toThrow();
  });

  it('rejects matrices with the wrong length', () => {
    expect(() => new ColorMatrixFilter({ matrix: [1, 0, 0, 0] })).toThrow(PixflowError);
    expect(() => new ColorMatrixFilter({ matrix: new Array(20).fill(0) })).toThrow(PixflowError);
  });

  it('rejects non-finite entries', () => {
    const m = [...IDENTITY_MATRIX];
    m[5] = Number.NaN;
    expect(() => new ColorMatrixFilter({ matrix: m })).toThrow(PixflowError);
  });

  it('rejects malformed bias', () => {
    expect(
      () =>
        new ColorMatrixFilter({
          matrix: [...IDENTITY_MATRIX],
          // @ts-expect-error -- intentional shape error
          bias: [0, 0],
        }),
    ).toThrow(PixflowError);
  });

  it('hash differs for different matrices', () => {
    const a = new ColorMatrixFilter({ matrix: [...IDENTITY_MATRIX] });
    const b = new ColorMatrixFilter({ matrix: [...GRAYSCALE_MATRIX] });
    expect(a.hash()).not.toBe(b.hash());
  });

  it('hash includes bias', () => {
    const a = new ColorMatrixFilter({ matrix: [...IDENTITY_MATRIX] });
    const b = new ColorMatrixFilter({
      matrix: [...IDENTITY_MATRIX],
      bias: [0.1, 0, 0, 0],
    });
    expect(a.hash()).not.toBe(b.hash());
  });
});
