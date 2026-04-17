import { describe, expect, it } from 'vitest';
import { WatermarkFilter } from '../src/filters/watermark.js';

describe('WatermarkFilter', () => {
  it('stores params and computes deterministic hash for identical params', () => {
    const image = new Blob(['wm'], { type: 'image/png' });
    const a = new WatermarkFilter({ image, position: 'top-left', opacity: 0.6, scale: 0.25, margin: 12 });
    const b = new WatermarkFilter({ image, position: 'top-left', opacity: 0.6, scale: 0.25, margin: 12 });

    expect(a.name).toBe('watermark');
    expect(a.stage).toBe('compute');
    expect(a.hash()).toBe(b.hash());
  });

  it('reports identity when opacity is zero', () => {
    const image = new Blob(['wm'], { type: 'image/png' });
    const f = new WatermarkFilter({ image, opacity: 0 });
    expect(f.isIdentity).toBe(true);
  });

  it('does not change output dimensions', () => {
    const image = new Blob(['wm'], { type: 'image/png' });
    const f = new WatermarkFilter({ image });
    expect(f.outputSize({ width: 640, height: 480 })).toEqual({ width: 640, height: 480 });
  });
});
