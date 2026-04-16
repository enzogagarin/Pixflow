import { describe, expect, it } from 'vitest';
import { SaturationFilter } from '../src/filters/saturation.js';
import { GaussianBlurFilter } from '../src/filters/gaussian-blur.js';
import { UnsharpMaskFilter } from '../src/filters/unsharp-mask.js';
import { PixflowError } from '../src/errors.js';

describe('SaturationFilter', () => {
  it('accepts valid amounts', () => {
    expect(new SaturationFilter({ amount: 0 }).hash()).toContain('amount=0.0000');
    expect(new SaturationFilter({ amount: 0.5 }).hash()).toContain('amount=0.5000');
  });

  it('rejects out-of-range amounts', () => {
    expect(() => new SaturationFilter({ amount: 2 })).toThrow(PixflowError);
    expect(() => new SaturationFilter({ amount: Number.NaN })).toThrow(PixflowError);
  });
});

describe('GaussianBlurFilter', () => {
  it('accepts a positive radius', () => {
    const f = new GaussianBlurFilter({ radius: 5 });
    expect(f.name).toBe('gaussianBlur');
    expect(f.hash()).toContain('r=5.00');
  });

  it('rejects radius outside [0, 64]', () => {
    expect(() => new GaussianBlurFilter({ radius: -1 })).toThrow(PixflowError);
    expect(() => new GaussianBlurFilter({ radius: 65 })).toThrow(PixflowError);
  });

  it('rejects non-positive sigma', () => {
    expect(() => new GaussianBlurFilter({ radius: 5, sigma: 0 })).toThrow(PixflowError);
    expect(() => new GaussianBlurFilter({ radius: 5, sigma: -1 })).toThrow(PixflowError);
  });
});

describe('UnsharpMaskFilter', () => {
  it('rejects amount outside [0, 5]', () => {
    expect(() => new UnsharpMaskFilter({ amount: -0.1, radius: 1 })).toThrow(PixflowError);
    expect(() => new UnsharpMaskFilter({ amount: 6, radius: 1 })).toThrow(PixflowError);
  });

  it('rejects radius outside (0, 64]', () => {
    expect(() => new UnsharpMaskFilter({ amount: 1, radius: 0 })).toThrow(PixflowError);
    expect(() => new UnsharpMaskFilter({ amount: 1, radius: 100 })).toThrow(PixflowError);
  });

  it('hash captures all params', () => {
    const a = new UnsharpMaskFilter({ amount: 0.5, radius: 2 });
    const b = new UnsharpMaskFilter({ amount: 0.5, radius: 2, threshold: 0.05 });
    expect(a.hash()).not.toBe(b.hash());
  });
});
