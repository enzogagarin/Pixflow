/**
 * UltraFace preprocess: resize source bitmap to 320×240 with letterboxing
 * (aspect-preserving), convert to RGB float32 in NCHW layout, normalize
 * via (pixel - 127) / 128.
 *
 * Returns the tensor + the scaling metadata the postprocess needs to
 * invert the letterbox when mapping detected boxes back to source
 * bitmap coords.
 */
export interface PreprocessResult {
  /** Flat tensor, NCHW layout, length = 3 × 240 × 320 = 230_400 floats. */
  readonly tensor: Float32Array;
  /** Letterbox metadata, used by postprocess to invert the transform. */
  readonly letterbox: LetterboxInfo;
}

export interface LetterboxInfo {
  readonly scale: number;
  /** Offset inside the 320×240 frame where the scaled image was placed. */
  readonly offsetX: number;
  readonly offsetY: number;
  readonly srcWidth: number;
  readonly srcHeight: number;
}

export const INPUT_WIDTH = 320;
export const INPUT_HEIGHT = 240;

/**
 * Accepts any CanvasImageSource-ish bitmap. Uses an OffscreenCanvas to
 * resize in one drawImage call — faster than walking pixels in JS, and
 * handles arbitrary source sizes including EXIF-rotated.
 */
export function preprocess(bitmap: ImageBitmap): PreprocessResult {
  const srcW = bitmap.width;
  const srcH = bitmap.height;
  const scale = Math.min(INPUT_WIDTH / srcW, INPUT_HEIGHT / srcH);
  const drawW = Math.round(srcW * scale);
  const drawH = Math.round(srcH * scale);
  const offsetX = Math.floor((INPUT_WIDTH - drawW) / 2);
  const offsetY = Math.floor((INPUT_HEIGHT - drawH) / 2);

  const canvas = new OffscreenCanvas(INPUT_WIDTH, INPUT_HEIGHT);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Preprocess: failed to acquire 2D context on OffscreenCanvas');
  }
  // Fill letterbox with middle-gray so the mean-centered normalization
  // keeps pad regions close to zero and they don't generate spurious
  // edge activations in the detector.
  ctx.fillStyle = 'rgb(127, 127, 127)';
  ctx.fillRect(0, 0, INPUT_WIDTH, INPUT_HEIGHT);
  ctx.drawImage(bitmap, 0, 0, srcW, srcH, offsetX, offsetY, drawW, drawH);
  const img = ctx.getImageData(0, 0, INPUT_WIDTH, INPUT_HEIGHT);

  // NCHW layout: [R plane, G plane, B plane], each plane 320×240.
  const plane = INPUT_WIDTH * INPUT_HEIGHT;
  const tensor = new Float32Array(3 * plane);
  const data = img.data;
  for (let i = 0; i < plane; i++) {
    const src = i * 4;
    tensor[i] = ((data[src] ?? 0) - 127) / 128;
    tensor[plane + i] = ((data[src + 1] ?? 0) - 127) / 128;
    tensor[2 * plane + i] = ((data[src + 2] ?? 0) - 127) / 128;
  }

  return {
    tensor,
    letterbox: { scale, offsetX, offsetY, srcWidth: srcW, srcHeight: srcH },
  };
}
