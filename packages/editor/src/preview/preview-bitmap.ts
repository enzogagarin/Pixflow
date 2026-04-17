/**
 * Bounds for the preview render target. The lower bound keeps tiny
 * windows from rendering pixelated previews; the upper bound caps GPU
 * cost so a 4K monitor doesn't drag interactive feel below 60fps.
 *
 * Spec Section 3 calls out "containerWidth × devicePixelRatio, clamped
 * to [512, 2048]" — these constants own that contract.
 */
export const PREVIEW_MIN = 512;
export const PREVIEW_MAX = 2048;

export interface PreviewSize {
  readonly width: number;
  readonly height: number;
}

interface ComputeArgs {
  readonly naturalWidth: number;
  readonly naturalHeight: number;
  readonly containerWidth: number;
  readonly devicePixelRatio: number;
}

/**
 * Compute the preview bitmap's pixel dimensions: the longest edge of the
 * source image is scaled to clamp(containerWidth × DPR, MIN, MAX), but
 * never above the source's natural size (no upscaling — that would just
 * waste GPU memory). Returned width/height preserve the source aspect.
 */
export function computePreviewSize(args: ComputeArgs): PreviewSize {
  const { naturalWidth, naturalHeight, containerWidth, devicePixelRatio } = args;
  const naturalLongest = Math.max(naturalWidth, naturalHeight);
  const desiredLongest = clamp(
    Math.round(containerWidth * devicePixelRatio),
    PREVIEW_MIN,
    PREVIEW_MAX,
  );
  const targetLongest = Math.min(desiredLongest, naturalLongest);
  const scale = targetLongest / naturalLongest;
  return {
    width: Math.round(naturalWidth * scale),
    height: Math.round(naturalHeight * scale),
  };
}

/**
 * Decode a downscaled preview bitmap from the source, sized according to
 * computePreviewSize. Wraps createImageBitmap so the engine has one
 * call site for "give me the preview bitmap for this state". Lives behind
 * an async function so it stays out of the synchronous pure module above.
 */
export async function createPreviewBitmap(
  source: ImageBitmap,
  args: ComputeArgs,
): Promise<ImageBitmap> {
  const size = computePreviewSize(args);
  if (size.width === source.width && size.height === source.height) {
    return source;
  }
  return createImageBitmap(source, {
    resizeWidth: size.width,
    resizeHeight: size.height,
    resizeQuality: 'high',
  });
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
