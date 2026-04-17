import { describe, expect, it } from 'vitest';
import { WhiteBalanceFilter, computeGain } from '../src/filters/white-balance.js';
import { PixflowError } from '../src/errors.js';

describe('computeGain', () => {
  it('returns identity gains for default params', () => {
    const g = computeGain({});
    expect(g.gainR).toBeCloseTo(1, 5);
    expect(g.gainG).toBeCloseTo(1, 5);
    expect(g.gainB).toBeCloseTo(1, 5);
  });

  it('positive temperature warms (boost R, cut B)', () => {
    const g = computeGain({ temperature: 0.5 });
    expect(g.gainR).toBeGreaterThan(1);
    expect(g.gainB).toBeLessThan(1);
    expect(g.gainG).toBeCloseTo(1, 5);
  });

  it('negative temperature cools (cut R, boost B)', () => {
    const g = computeGain({ temperature: -0.5 });
    expect(g.gainR).toBeLessThan(1);
    expect(g.gainB).toBeGreaterThan(1);
  });

  it('positive tint cuts G (push toward magenta)', () => {
    const g = computeGain({ tint: 0.5 });
    expect(g.gainG).toBeLessThan(1);
  });

  it('negative tint boosts G (push toward green)', () => {
    const g = computeGain({ tint: -0.5 });
    expect(g.gainG).toBeGreaterThan(1);
  });
});

describe('WhiteBalanceFilter', () => {
  it('accepts no-args (identity)', () => {
    const f = new WhiteBalanceFilter({});
    expect(f.name).toBe('whiteBalance');
    expect(f.stage).toBe('compute');
  });

  it('rejects out-of-range params', () => {
    expect(() => new WhiteBalanceFilter({ temperature: 2 })).toThrow(PixflowError);
    expect(() => new WhiteBalanceFilter({ tint: -1.5 })).toThrow(PixflowError);
    expect(() => new WhiteBalanceFilter({ temperature: Number.NaN })).toThrow(PixflowError);
  });

  it('hash differs across distinct params and stable for equal ones', () => {
    const a = new WhiteBalanceFilter({ temperature: 0.2, tint: 0.1 });
    const b = new WhiteBalanceFilter({ temperature: 0.2, tint: 0.1 });
    const c = new WhiteBalanceFilter({ temperature: 0.3, tint: 0.1 });
    expect(a.hash()).toBe(b.hash());
    expect(a.hash()).not.toBe(c.hash());
  });
});
