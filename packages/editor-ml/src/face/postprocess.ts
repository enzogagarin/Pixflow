import { INPUT_HEIGHT, INPUT_WIDTH, type LetterboxInfo } from './preprocess.js';

export interface FaceBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly confidence: number;
}

export interface PostprocessOptions {
  /** Minimum face probability to keep a detection. Default 0.7. */
  readonly minConfidence?: number;
  /** IoU threshold for non-max suppression. Default 0.3 (aggressive). */
  readonly iouThreshold?: number;
  /** Cap on detections returned (after NMS). Default 64. */
  readonly maxFaces?: number;
}

const DEFAULT_MIN_CONFIDENCE = 0.7;
const DEFAULT_IOU_THRESHOLD = 0.3;
const DEFAULT_MAX_FACES = 64;

/**
 * Decode UltraFace outputs into source-bitmap-space face boxes.
 *
 * UltraFace output layout:
 *   - scores: shape [1, N, 2], channel 0 = background, channel 1 = face
 *   - boxes:  shape [1, N, 4], (x1, y1, x2, y2) normalized to [0, 1] in
 *             the 320×240 letterboxed frame
 *
 * Steps:
 *   1. Threshold by face probability (scores[i][1] > minConfidence).
 *   2. Invert letterbox: de-pad + de-scale into source bitmap coords.
 *   3. Non-max suppression (IoU > iouThreshold) to dedupe overlapping
 *      predictions, greedy high-score-first.
 *   4. Truncate to maxFaces.
 */
export function postprocess(
  scores: Float32Array | number[],
  boxes: Float32Array | number[],
  letterbox: LetterboxInfo,
  options: PostprocessOptions = {},
): FaceBox[] {
  const minConf = options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const iouT = options.iouThreshold ?? DEFAULT_IOU_THRESHOLD;
  const maxFaces = options.maxFaces ?? DEFAULT_MAX_FACES;

  const n = Math.floor(scores.length / 2);
  const candidates: FaceBox[] = [];

  for (let i = 0; i < n; i++) {
    const conf = scores[i * 2 + 1] ?? 0;
    if (conf < minConf) continue;

    // Normalized corner-form in the 320×240 frame.
    const nx1 = boxes[i * 4 + 0] ?? 0;
    const ny1 = boxes[i * 4 + 1] ?? 0;
    const nx2 = boxes[i * 4 + 2] ?? 0;
    const ny2 = boxes[i * 4 + 3] ?? 0;

    // De-normalize to letterboxed pixel space.
    const lx1 = nx1 * INPUT_WIDTH;
    const ly1 = ny1 * INPUT_HEIGHT;
    const lx2 = nx2 * INPUT_WIDTH;
    const ly2 = ny2 * INPUT_HEIGHT;

    // Invert letterbox: subtract pad offset, divide by scale → source coords.
    const sx1 = (lx1 - letterbox.offsetX) / letterbox.scale;
    const sy1 = (ly1 - letterbox.offsetY) / letterbox.scale;
    const sx2 = (lx2 - letterbox.offsetX) / letterbox.scale;
    const sy2 = (ly2 - letterbox.offsetY) / letterbox.scale;

    const x = clamp(Math.min(sx1, sx2), 0, letterbox.srcWidth);
    const y = clamp(Math.min(sy1, sy2), 0, letterbox.srcHeight);
    const w = Math.max(1, clamp(Math.max(sx1, sx2), 0, letterbox.srcWidth) - x);
    const h = Math.max(1, clamp(Math.max(sy1, sy2), 0, letterbox.srcHeight) - y);

    candidates.push({ x, y, w, h, confidence: conf });
  }

  // Sort descending by confidence for greedy NMS.
  candidates.sort((a, b) => b.confidence - a.confidence);

  const kept: FaceBox[] = [];
  for (const c of candidates) {
    let keep = true;
    for (const k of kept) {
      if (iou(c, k) > iouT) {
        keep = false;
        break;
      }
    }
    if (keep) {
      kept.push(c);
      if (kept.length >= maxFaces) break;
    }
  }
  return kept;
}

function iou(a: FaceBox, b: FaceBox): number {
  const ix1 = Math.max(a.x, b.x);
  const iy1 = Math.max(a.y, b.y);
  const ix2 = Math.min(a.x + a.w, b.x + b.w);
  const iy2 = Math.min(a.y + a.h, b.y + b.h);
  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;
  if (inter <= 0) return 0;
  const union = a.w * a.h + b.w * b.h - inter;
  return inter / union;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
