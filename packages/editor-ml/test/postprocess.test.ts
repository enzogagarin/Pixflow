import { describe, expect, it } from 'vitest';
import { postprocess } from '../src/face/postprocess.js';
import { INPUT_HEIGHT, INPUT_WIDTH, type LetterboxInfo } from '../src/face/preprocess.js';

/**
 * Source 640×480, scaled uniformly to fit 320×240 → scale = 0.5,
 * no letterbox pad (aspect matches). Simplifies coordinate math in tests.
 */
const NO_PAD: LetterboxInfo = {
  scale: 0.5,
  offsetX: 0,
  offsetY: 0,
  srcWidth: 640,
  srcHeight: 480,
};

/**
 * Source 320×240 → fits exactly, scale 1, no pad. Even simpler coord math:
 * normalized-in == normalized-out × srcW/H.
 */
const IDENTITY: LetterboxInfo = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  srcWidth: INPUT_WIDTH,
  srcHeight: INPUT_HEIGHT,
};

/**
 * Build a scores tensor packed as [bg, face, bg, face, …] for n candidates.
 * faceProbs[i] determines the i-th face probability.
 */
function scoresOf(faceProbs: number[]): Float32Array {
  const out = new Float32Array(faceProbs.length * 2);
  for (let i = 0; i < faceProbs.length; i++) {
    out[i * 2] = 1 - (faceProbs[i] ?? 0);
    out[i * 2 + 1] = faceProbs[i] ?? 0;
  }
  return out;
}

/** Normalized corner boxes packed as [x1,y1,x2,y2,…]. Values in [0,1]. */
function boxesOf(rects: number[][]): Float32Array {
  const out = new Float32Array(rects.length * 4);
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i] ?? [0, 0, 0, 0];
    out[i * 4 + 0] = r[0] ?? 0;
    out[i * 4 + 1] = r[1] ?? 0;
    out[i * 4 + 2] = r[2] ?? 0;
    out[i * 4 + 3] = r[3] ?? 0;
  }
  return out;
}

describe('postprocess — thresholding', () => {
  it('returns empty when no candidate clears minConfidence', () => {
    const scores = scoresOf([0.4, 0.2, 0.5]);
    const boxes = boxesOf([
      [0.1, 0.1, 0.3, 0.3],
      [0.2, 0.2, 0.4, 0.4],
      [0.3, 0.3, 0.5, 0.5],
    ]);
    const out = postprocess(scores, boxes, IDENTITY, { minConfidence: 0.7 });
    expect(out).toEqual([]);
  });

  it('keeps only candidates above minConfidence', () => {
    const scores = scoresOf([0.95, 0.4, 0.85]);
    const boxes = boxesOf([
      [0.1, 0.1, 0.2, 0.2],
      [0.3, 0.3, 0.4, 0.4],
      [0.5, 0.5, 0.6, 0.6],
    ]);
    const out = postprocess(scores, boxes, IDENTITY, { minConfidence: 0.7 });
    expect(out).toHaveLength(2);
    // Sorted descending by confidence.
    expect(out[0]?.confidence).toBeCloseTo(0.95);
    expect(out[1]?.confidence).toBeCloseTo(0.85);
  });

  it('uses DEFAULT_MIN_CONFIDENCE = 0.7 when none supplied', () => {
    const scores = scoresOf([0.69, 0.71]);
    const boxes = boxesOf([
      [0, 0, 0.1, 0.1],
      [0.5, 0.5, 0.6, 0.6],
    ]);
    const out = postprocess(scores, boxes, IDENTITY);
    expect(out).toHaveLength(1);
    expect(out[0]?.confidence).toBeCloseTo(0.71);
  });
});

describe('postprocess — letterbox inversion', () => {
  it('maps a normalized identity box onto source bitmap pixels', () => {
    const scores = scoresOf([0.9]);
    const boxes = boxesOf([[0.25, 0.25, 0.5, 0.5]]);
    const out = postprocess(scores, boxes, IDENTITY);
    // 0.25 * 320 = 80 in letterboxed space; /scale=1, -offset=0 → src=80
    // 0.5 * 320 = 160 in letterboxed; src=160
    expect(out[0]?.x).toBe(80);
    expect(out[0]?.y).toBeCloseTo(0.25 * INPUT_HEIGHT, 0); // 60
    expect(out[0]?.w).toBe(80); // 160 - 80
    expect(out[0]?.h).toBeCloseTo(60, 0);
  });

  it('scales up when source is larger than 320×240', () => {
    // NO_PAD: src 640×480 → scale 0.5, no offset.
    const scores = scoresOf([0.9]);
    const boxes = boxesOf([[0.25, 0.25, 0.5, 0.5]]);
    const out = postprocess(scores, boxes, NO_PAD);
    // letterboxed: 80..160 → src: /0.5 = 160..320
    expect(out[0]?.x).toBe(160);
    expect(out[0]?.w).toBe(160);
  });

  it('accounts for pad offset (portrait source → wider letterbox)', () => {
    // A 120×240 source → scale = min(320/120, 240/240) = 1 (no height scale),
    // drawn at 120 wide starting at offsetX = (320-120)/2 = 100.
    const lb: LetterboxInfo = {
      scale: 1,
      offsetX: 100,
      offsetY: 0,
      srcWidth: 120,
      srcHeight: 240,
    };
    // Face centered inside the source occupies letterbox x ∈ [100+20, 100+100] = [120, 200]
    // → normalized x ∈ [120/320, 200/320] = [0.375, 0.625]
    const scores = scoresOf([0.9]);
    const boxes = boxesOf([[0.375, 0.1, 0.625, 0.9]]);
    const out = postprocess(scores, boxes, lb);
    // After inversion: src x = (0.375*320 - 100)/1 = 20
    // src x2 = (0.625*320 - 100)/1 = 100
    expect(out[0]?.x).toBe(20);
    expect(out[0]?.w).toBe(80);
  });

  it('clamps boxes that leak outside the source (negative after pad subtraction)', () => {
    const lb: LetterboxInfo = {
      scale: 1,
      offsetX: 100,
      offsetY: 0,
      srcWidth: 120,
      srcHeight: 240,
    };
    // Normalized box that sits in the left pad → source x would be negative.
    const scores = scoresOf([0.9]);
    const boxes = boxesOf([[0.0, 0.1, 0.1, 0.9]]);
    const out = postprocess(scores, boxes, lb);
    expect(out[0]?.x).toBe(0);
    // w must stay ≥ 1 by clamp.
    expect(out[0]?.w).toBeGreaterThanOrEqual(1);
  });
});

describe('postprocess — NMS', () => {
  it('suppresses a lower-confidence box that overlaps a keeper above IoU threshold', () => {
    const scores = scoresOf([0.95, 0.9]);
    // Two boxes with ~90% IoU; keep highest.
    const boxes = boxesOf([
      [0.1, 0.1, 0.5, 0.5],
      [0.12, 0.12, 0.5, 0.5],
    ]);
    const out = postprocess(scores, boxes, IDENTITY, { iouThreshold: 0.3 });
    expect(out).toHaveLength(1);
    expect(out[0]?.confidence).toBeCloseTo(0.95);
  });

  it('keeps both boxes when IoU is below the threshold (disjoint detections)', () => {
    const scores = scoresOf([0.9, 0.85]);
    const boxes = boxesOf([
      [0.05, 0.05, 0.2, 0.2],
      [0.6, 0.6, 0.8, 0.8],
    ]);
    const out = postprocess(scores, boxes, IDENTITY, { iouThreshold: 0.3 });
    expect(out).toHaveLength(2);
  });

  it('prefers the highest-confidence candidate (greedy NMS)', () => {
    const scores = scoresOf([0.8, 0.95, 0.85]);
    const overlapping = [0.1, 0.1, 0.5, 0.5];
    const boxes = boxesOf([overlapping, overlapping, overlapping]);
    const out = postprocess(scores, boxes, IDENTITY);
    expect(out).toHaveLength(1);
    expect(out[0]?.confidence).toBeCloseTo(0.95);
  });
});

describe('postprocess — maxFaces cap', () => {
  it('truncates after maxFaces even if more pass thresholding', () => {
    // Five disjoint high-confidence boxes; cap to 3.
    const scores = scoresOf([0.9, 0.9, 0.9, 0.9, 0.9]);
    const boxes = boxesOf([
      [0.0, 0.0, 0.15, 0.15],
      [0.2, 0.0, 0.35, 0.15],
      [0.4, 0.0, 0.55, 0.15],
      [0.6, 0.0, 0.75, 0.15],
      [0.8, 0.0, 0.95, 0.15],
    ]);
    const out = postprocess(scores, boxes, IDENTITY, { maxFaces: 3 });
    expect(out).toHaveLength(3);
  });
});
