import { describe, it, expect } from 'vitest';
import {
  computePreviewSize,
  PREVIEW_MIN,
  PREVIEW_MAX,
} from '../src/preview/preview-bitmap';

describe('computePreviewSize', () => {
  it('returns natural size when smaller than the minimum target', () => {
    const out = computePreviewSize({
      naturalWidth: 200,
      naturalHeight: 150,
      containerWidth: 800,
      devicePixelRatio: 1,
    });
    expect(out).toEqual({ width: 200, height: 150 });
  });

  it('clamps to PREVIEW_MAX on the longest edge while preserving aspect ratio', () => {
    const out = computePreviewSize({
      naturalWidth: 8000,
      naturalHeight: 4000,
      containerWidth: 4000,
      devicePixelRatio: 1,
    });
    expect(out.width).toBe(PREVIEW_MAX);
    expect(out.height).toBe(Math.round(PREVIEW_MAX / 2));
  });

  it('clamps to PREVIEW_MIN when container * DPR is too small', () => {
    const out = computePreviewSize({
      naturalWidth: 4000,
      naturalHeight: 3000,
      containerWidth: 200,
      devicePixelRatio: 1,
    });
    expect(out.width).toBe(PREVIEW_MIN);
    expect(out.height).toBe(Math.round((PREVIEW_MIN / 4000) * 3000));
  });

  it('factors devicePixelRatio into the target', () => {
    const out = computePreviewSize({
      naturalWidth: 4000,
      naturalHeight: 3000,
      containerWidth: 600,
      devicePixelRatio: 2,
    });
    expect(out.width).toBe(1200);
    expect(out.height).toBe(900);
  });

  it('handles portrait sources by clamping the longest edge (height)', () => {
    const out = computePreviewSize({
      naturalWidth: 3000,
      naturalHeight: 6000,
      containerWidth: 1000,
      devicePixelRatio: 1,
    });
    expect(out.height).toBe(1000);
    expect(out.width).toBe(500);
  });
});
