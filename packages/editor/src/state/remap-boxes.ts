import type { CropRect, FaceBox } from './types';

/**
 * Translate face boxes from the original bitmap coordinate space into the
 * post-crop coordinate space. Width, height, and confidence are preserved;
 * only x and y are shifted by the crop origin. When no crop is active,
 * returns a shallow copy so callers can freely mutate.
 *
 * This function does NOT clip boxes that fall outside the crop rectangle —
 * the pipeline's filter will harmlessly write off-bounds dispatches, and
 * Canvas2D fallbacks clip at compose time. If strict clipping becomes
 * necessary (e.g. to avoid wasted GPU work on fully-outside boxes), that's
 * a future optimization.
 */
export function remapBoxesForCrop(
  boxes: readonly FaceBox[],
  crop: CropRect | null,
): FaceBox[] {
  if (!crop) return boxes.slice();
  return boxes.map((box) => ({
    x: box.x - crop.x,
    y: box.y - crop.y,
    w: box.w,
    h: box.h,
    confidence: box.confidence,
  }));
}
