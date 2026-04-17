import { describe, expect, it } from 'vitest';
import { CropFilter } from '../src/filters/crop.js';
import { Rotate90Filter } from '../src/filters/rotate90.js';
import { FlipFilter } from '../src/filters/flip.js';
import { PadFilter } from '../src/filters/pad.js';
import { PixflowError } from '../src/errors.js';

describe('CropFilter', () => {
  it('reports the cropped dimensions', () => {
    const f = new CropFilter({ x: 10, y: 20, width: 100, height: 50 });
    expect(f.outputSize({ width: 1000, height: 1000 })).toEqual({ width: 100, height: 50 });
  });

  it('rejects non-integer or negative geometry', () => {
    expect(() => new CropFilter({ x: -1, y: 0, width: 10, height: 10 })).toThrow(PixflowError);
    expect(() => new CropFilter({ x: 0, y: 0, width: 0, height: 10 })).toThrow(PixflowError);
    expect(() => new CropFilter({ x: 1.5, y: 0, width: 10, height: 10 })).toThrow(PixflowError);
  });
});

describe('Rotate90Filter', () => {
  it('swaps dims for 90 and 270 turns', () => {
    expect(new Rotate90Filter({ turns: 1 }).outputSize({ width: 800, height: 600 })).toEqual({
      width: 600,
      height: 800,
    });
    expect(new Rotate90Filter({ turns: 3 }).outputSize({ width: 800, height: 600 })).toEqual({
      width: 600,
      height: 800,
    });
  });

  it('preserves dims for 180 turn', () => {
    expect(new Rotate90Filter({ turns: 2 }).outputSize({ width: 800, height: 600 })).toEqual({
      width: 800,
      height: 600,
    });
  });

  it('rejects invalid turns', () => {
    // @ts-expect-error testing bad input
    expect(() => new Rotate90Filter({ turns: 4 })).toThrow(PixflowError);
    // @ts-expect-error testing bad input
    expect(() => new Rotate90Filter({ turns: 0 })).toThrow(PixflowError);
  });
});

describe('FlipFilter', () => {
  it('accepts h, v, both axes', () => {
    expect(new FlipFilter({ axis: 'h' }).hash()).toBe('flip|axis=h');
    expect(new FlipFilter({ axis: 'v' }).hash()).toBe('flip|axis=v');
    expect(new FlipFilter({ axis: 'both' }).hash()).toBe('flip|axis=both');
  });

  it('rejects unknown axis', () => {
    // @ts-expect-error testing bad input
    expect(() => new FlipFilter({ axis: 'x' })).toThrow(PixflowError);
  });
});

describe('PadFilter', () => {
  it('grows the canvas by the requested padding', () => {
    const f = new PadFilter({ top: 10, right: 20, bottom: 30, left: 40 });
    expect(f.outputSize({ width: 100, height: 100 })).toEqual({ width: 160, height: 140 });
  });

  it('rejects non-integer or negative padding', () => {
    expect(() => new PadFilter({ top: -1, right: 0, bottom: 0, left: 0 })).toThrow(PixflowError);
    expect(() => new PadFilter({ top: 1.5, right: 0, bottom: 0, left: 0 })).toThrow(PixflowError);
  });
});
