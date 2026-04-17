import { describe, expect, it } from 'vitest';
import { BrightnessFilter } from '../src/filters/brightness.js';
import { ContrastFilter } from '../src/filters/contrast.js';
import { PixflowError } from '../src/errors.js';

describe('BrightnessFilter', () => {
  it('stores params and exposes the correct stage/name', () => {
    const f = new BrightnessFilter({ amount: 0.25 });
    expect(f.name).toBe('brightness');
    expect(f.stage).toBe('compute');
    expect(f.params.amount).toBeCloseTo(0.25);
  });

  it('produces a deterministic hash for identical params', () => {
    const a = new BrightnessFilter({ amount: 0.2 });
    const b = new BrightnessFilter({ amount: 0.2 });
    expect(a.hash()).toBe(b.hash());
  });

  it('produces different hashes when params differ', () => {
    const a = new BrightnessFilter({ amount: 0.2 });
    const b = new BrightnessFilter({ amount: 0.3 });
    expect(a.hash()).not.toBe(b.hash());
  });

  it('rejects out-of-range amounts with PixflowError', () => {
    expect(() => new BrightnessFilter({ amount: 2 })).toThrow(PixflowError);
    expect(() => new BrightnessFilter({ amount: Number.NaN })).toThrow(PixflowError);
  });
});

describe('ContrastFilter', () => {
  it('has a hash distinct from BrightnessFilter for the same amount', () => {
    const b = new BrightnessFilter({ amount: 0.2 });
    const c = new ContrastFilter({ amount: 0.2 });
    expect(c.hash()).not.toBe(b.hash());
  });

  it('rejects invalid amounts', () => {
    expect(() => new ContrastFilter({ amount: -5 })).toThrow(PixflowError);
  });
});
