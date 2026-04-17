import { describe, it, expect } from 'vitest';
import { remapBoxesForCrop } from '../src/state/remap-boxes';
import type { FaceBox, CropRect } from '../src/state/types';

describe('remapBoxesForCrop', () => {
  it('returns a fresh array copy when crop is null (no mutation of input)', () => {
    const boxes: FaceBox[] = [
      { x: 100, y: 100, w: 50, h: 50, confidence: 0.9 },
    ];
    const result = remapBoxesForCrop(boxes, null);
    expect(result).toEqual(boxes);
    expect(result).not.toBe(boxes);
  });

  it('translates box coordinates by the crop origin', () => {
    const boxes: FaceBox[] = [
      { x: 300, y: 200, w: 50, h: 60, confidence: 0.9 },
    ];
    const crop: CropRect = { x: 100, y: 80, w: 400, h: 300 };
    const result = remapBoxesForCrop(boxes, crop);
    expect(result).toEqual([
      { x: 200, y: 120, w: 50, h: 60, confidence: 0.9 },
    ]);
  });

  it('preserves width, height, and confidence under translation', () => {
    const boxes: FaceBox[] = [
      { x: 500, y: 400, w: 77, h: 88, confidence: 0.71 },
    ];
    const crop: CropRect = { x: 250, y: 250, w: 800, h: 600 };
    const result = remapBoxesForCrop(boxes, crop);
    expect(result[0]?.w).toBe(77);
    expect(result[0]?.h).toBe(88);
    expect(result[0]?.confidence).toBe(0.71);
  });

  it('handles multiple boxes', () => {
    const boxes: FaceBox[] = [
      { x: 100, y: 100, w: 50, h: 50, confidence: 0.95 },
      { x: 300, y: 150, w: 40, h: 40, confidence: 0.82 },
    ];
    const crop: CropRect = { x: 50, y: 50, w: 400, h: 300 };
    const result = remapBoxesForCrop(boxes, crop);
    expect(result).toHaveLength(2);
    expect(result[0]?.x).toBe(50);
    expect(result[0]?.y).toBe(50);
    expect(result[1]?.x).toBe(250);
    expect(result[1]?.y).toBe(100);
  });

  it('returns an empty array for empty input regardless of crop', () => {
    expect(remapBoxesForCrop([], null)).toEqual([]);
    expect(remapBoxesForCrop([], { x: 10, y: 10, w: 100, h: 100 })).toEqual([]);
  });
});
