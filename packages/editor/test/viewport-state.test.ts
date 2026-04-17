import { describe, it, expect } from 'vitest';
import {
  identityTransform,
  zoomAt,
  pan,
  fitToContainer,
  clampScale,
  ZOOM_MIN,
  ZOOM_MAX,
  type ViewportTransform,
} from '../src/viewport/viewport-state';

describe('clampScale', () => {
  it('returns ZOOM_MIN when scale is below the minimum', () => {
    expect(clampScale(ZOOM_MIN / 2)).toBe(ZOOM_MIN);
  });
  it('returns ZOOM_MAX when scale is above the maximum', () => {
    expect(clampScale(ZOOM_MAX * 2)).toBe(ZOOM_MAX);
  });
  it('passes through values inside the range', () => {
    expect(clampScale(1.5)).toBe(1.5);
  });
});

describe('zoomAt', () => {
  it('keeps the focal point fixed when scaling up', () => {
    const before: ViewportTransform = { scale: 1, offsetX: 0, offsetY: 0 };
    const after = zoomAt(before, 2, { x: 100, y: 50 });
    const beforeImg = {
      x: (100 - before.offsetX) / before.scale,
      y: (50 - before.offsetY) / before.scale,
    };
    const afterImg = {
      x: (100 - after.offsetX) / after.scale,
      y: (50 - after.offsetY) / after.scale,
    };
    expect(afterImg.x).toBeCloseTo(beforeImg.x);
    expect(afterImg.y).toBeCloseTo(beforeImg.y);
    expect(after.scale).toBeCloseTo(2);
  });

  it('clamps the scale to ZOOM_MAX', () => {
    const before: ViewportTransform = { scale: 1, offsetX: 0, offsetY: 0 };
    const after = zoomAt(before, ZOOM_MAX * 10, { x: 0, y: 0 });
    expect(after.scale).toBe(ZOOM_MAX);
  });

  it('clamps the scale to ZOOM_MIN', () => {
    const before: ViewportTransform = { scale: 1, offsetX: 0, offsetY: 0 };
    const after = zoomAt(before, ZOOM_MIN / 10, { x: 0, y: 0 });
    expect(after.scale).toBe(ZOOM_MIN);
  });
});

describe('pan', () => {
  it('adds dx/dy to the current offset', () => {
    const before: ViewportTransform = { scale: 1.5, offsetX: 10, offsetY: 20 };
    const after = pan(before, 30, -5);
    expect(after).toEqual({ scale: 1.5, offsetX: 40, offsetY: 15 });
  });
});

describe('fitToContainer', () => {
  it('computes a scale + centered offset that fits the image inside the container', () => {
    const out = fitToContainer({
      imageWidth: 4000,
      imageHeight: 3000,
      containerWidth: 800,
      containerHeight: 600,
    });
    expect(out.scale).toBeCloseTo(0.2);
    expect(out.offsetX).toBeCloseTo(0);
    expect(out.offsetY).toBeCloseTo(0);
  });

  it('letterboxes a portrait image into a landscape container', () => {
    const out = fitToContainer({
      imageWidth: 600,
      imageHeight: 1200,
      containerWidth: 800,
      containerHeight: 600,
    });
    expect(out.scale).toBeCloseTo(0.5);
    expect(out.offsetX).toBeCloseTo(250);
    expect(out.offsetY).toBeCloseTo(0);
  });
});

describe('identityTransform', () => {
  it('returns scale=1, offset=0', () => {
    expect(identityTransform()).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });
});
