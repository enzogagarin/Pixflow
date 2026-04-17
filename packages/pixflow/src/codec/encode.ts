import { ErrorCode, PixflowError } from '../errors.js';

export type EncodeFormat = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/avif';

export interface EncodeResult {
  readonly blob: Blob;
  readonly format: EncodeFormat;
  readonly fallback?: EncodeFormat;
}

export interface EncodeRequest {
  readonly format?: EncodeFormat;
  readonly quality?: number;
}

export const DEFAULT_ENCODE_FORMAT: EncodeFormat = 'image/png';

let avifSupportCache: Promise<boolean> | null = null;

/**
 * Probe whether the current environment can encode AVIF blobs. On Chrome this is
 * `OffscreenCanvas.convertToBlob({ type: 'image/avif' })`. Environments that
 * silently fall back to PNG (older Chrome, Safari) return false so callers can
 * pick a different format instead of shipping the wrong bytes to users.
 */
export async function isAvifEncodingSupported(): Promise<boolean> {
  if (avifSupportCache !== null) return avifSupportCache;
  avifSupportCache = (async () => {
    try {
      if (typeof OffscreenCanvas === 'undefined') return false;
      const canvas = new OffscreenCanvas(2, 2);
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 2, 2);
      const blob = await canvas.convertToBlob({ type: 'image/avif', quality: 0.8 });
      return blob.type === 'image/avif';
    } catch {
      return false;
    }
  })();
  return avifSupportCache;
}

/** Forget the cached AVIF support result. Primarily useful from tests. */
export function resetAvifSupportCache(): void {
  avifSupportCache = null;
}

/**
 * Encode a canvas to a Blob. PNG/JPEG/WebP go through `convertToBlob` directly;
 * AVIF probes for support and falls back to WebP with `fallback` set on the
 * result so the caller can report it honestly.
 */
export async function encodeCanvas(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  request: EncodeRequest = {},
): Promise<EncodeResult> {
  const format = request.format ?? DEFAULT_ENCODE_FORMAT;
  const quality = request.quality;

  if (format === 'image/avif') {
    const supported = await isAvifEncodingSupported();
    if (supported) {
      try {
        const blob = await convertToBlob(canvas, 'image/avif', quality);
        if (blob.type === 'image/avif') {
          return { blob, format: 'image/avif' };
        }
      } catch {
        // fall through to WebP fallback
      }
    }
    const fallbackBlob = await convertToBlob(canvas, 'image/webp', quality);
    return { blob: fallbackBlob, format: 'image/webp', fallback: 'image/webp' };
  }

  const blob = await convertToBlob(canvas, format, quality);
  return { blob, format };
}

async function convertToBlob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  type: EncodeFormat,
  quality: number | undefined,
): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    try {
      const opts: ImageEncodeOptions = { type };
      if (quality !== undefined) opts.quality = quality;
      return await canvas.convertToBlob(opts);
    } catch (cause) {
      throw new PixflowError(
        ErrorCode.ENCODING_FAILED,
        `OffscreenCanvas.convertToBlob failed for type=${type}.`,
        { cause },
      );
    }
  }

  return new Promise<Blob>((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      (blob) => {
        if (!blob) {
          reject(
            new PixflowError(
              ErrorCode.ENCODING_FAILED,
              `HTMLCanvasElement.toBlob returned null for type=${type}.`,
            ),
          );
          return;
        }
        resolve(blob);
      },
      type,
      quality,
    );
  });
}
