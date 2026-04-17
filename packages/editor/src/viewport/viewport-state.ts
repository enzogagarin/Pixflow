/**
 * Pure transform model for the canvas viewport. The image is laid out
 * inside the container with `transform: translate(offsetX, offsetY)
 * scale(scale)` applied to the canvas wrapper. Coordinates are in
 * container CSS pixels; scale is unitless (1 = 1 image-px per CSS-px).
 */
export interface ViewportTransform {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

/**
 * Zoom range. 1/8x lower bound is generous enough to view huge images
 * (8000+px) end-to-end without losing anchor points. 8x upper bound
 * matches photo-editor convention (Lightroom caps at 8:1, Photoshop
 * at 32:1 — 8 is a deliberate compromise: enough for pixel-peeping
 * face boxes, not so much that we wreck the GPU on a 10-megapixel preview).
 */
export const ZOOM_MIN = 0.125;
export const ZOOM_MAX = 8;

export function identityTransform(): ViewportTransform {
  return { scale: 1, offsetX: 0, offsetY: 0 };
}

export function clampScale(scale: number): number {
  if (scale < ZOOM_MIN) return ZOOM_MIN;
  if (scale > ZOOM_MAX) return ZOOM_MAX;
  return scale;
}

/**
 * Scale by `factor` while keeping the focal point fixed in screen space.
 * Standard "zoom around mouse" math: the image-space point under the
 * focal screen point must map to the same screen point after scaling.
 *
 *   imagePt = (screen - offset) / scale
 *   scale'  = scale × factor
 *   offset' = screen - imagePt × scale'
 */
export function zoomAt(
  t: ViewportTransform,
  factor: number,
  focal: { readonly x: number; readonly y: number },
): ViewportTransform {
  const targetScale = clampScale(t.scale * factor);
  if (targetScale === t.scale) return t;
  const imageX = (focal.x - t.offsetX) / t.scale;
  const imageY = (focal.y - t.offsetY) / t.scale;
  return {
    scale: targetScale,
    offsetX: focal.x - imageX * targetScale,
    offsetY: focal.y - imageY * targetScale,
  };
}

/** Translate by raw screen-space delta. */
export function pan(t: ViewportTransform, dx: number, dy: number): ViewportTransform {
  return { scale: t.scale, offsetX: t.offsetX + dx, offsetY: t.offsetY + dy };
}

interface FitArgs {
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly containerWidth: number;
  readonly containerHeight: number;
}

/**
 * Compute the transform that displays the entire image inside the
 * container with letterbox / pillarbox padding as needed. Result is
 * always centered.
 */
export function fitToContainer(args: FitArgs): ViewportTransform {
  const sx = args.containerWidth / args.imageWidth;
  const sy = args.containerHeight / args.imageHeight;
  const scale = clampScale(Math.min(sx, sy));
  const displayedW = args.imageWidth * scale;
  const displayedH = args.imageHeight * scale;
  return {
    scale,
    offsetX: (args.containerWidth - displayedW) / 2,
    offsetY: (args.containerHeight - displayedH) / 2,
  };
}
