import { ErrorCode, PixflowError } from '../errors.js';
import type { ImageSource } from '../types.js';

const DEFAULT_FORMAT: GPUTextureFormat = 'rgba8unorm';

function inputTextureUsage(): GPUTextureUsageFlags {
  return (
    GPUTextureUsage.TEXTURE_BINDING |
    GPUTextureUsage.COPY_DST |
    GPUTextureUsage.COPY_SRC |
    GPUTextureUsage.RENDER_ATTACHMENT
  );
}

function intermediateTextureUsage(): GPUTextureUsageFlags {
  return (
    GPUTextureUsage.TEXTURE_BINDING |
    GPUTextureUsage.STORAGE_BINDING |
    GPUTextureUsage.COPY_SRC |
    GPUTextureUsage.COPY_DST
  );
}

export async function sourceToImageBitmap(source: ImageSource): Promise<ImageBitmap> {
  try {
    if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) {
      return source;
    }
    if (typeof Blob !== 'undefined' && source instanceof Blob) {
      return await createImageBitmap(source);
    }
    if (typeof HTMLImageElement !== 'undefined' && source instanceof HTMLImageElement) {
      if (!source.complete) {
        await source.decode();
      }
      return await createImageBitmap(source);
    }
    if (typeof source === 'string') {
      const response = await fetch(source);
      if (!response.ok) {
        throw new PixflowError(
          ErrorCode.INVALID_INPUT,
          `Failed to fetch image from URL: HTTP ${response.status.toString()}`,
        );
      }
      const blob = await response.blob();
      return await createImageBitmap(blob);
    }
    throw new PixflowError(
      ErrorCode.INVALID_INPUT,
      'Unsupported image source. Expected File, Blob, URL string, ImageBitmap, or HTMLImageElement.',
    );
  } catch (err) {
    if (PixflowError.is(err)) throw err;
    throw new PixflowError(ErrorCode.INVALID_INPUT, 'Failed to decode image source.', {
      cause: err,
    });
  }
}

export interface ImportedImage {
  readonly texture: GPUTexture;
  readonly width: number;
  readonly height: number;
}

export async function imageToTexture(
  device: GPUDevice,
  source: ImageSource,
  options: { format?: GPUTextureFormat } = {},
): Promise<ImportedImage> {
  const bitmap = await sourceToImageBitmap(source);
  const format = options.format ?? DEFAULT_FORMAT;
  const { width, height } = bitmap;

  if (width === 0 || height === 0) {
    throw new PixflowError(
      ErrorCode.INVALID_INPUT,
      `Image has zero dimension: ${width.toString()}x${height.toString()}.`,
    );
  }

  const texture = device.createTexture({
    size: { width, height, depthOrArrayLayers: 1 },
    format,
    usage: inputTextureUsage(),
  });

  device.queue.copyExternalImageToTexture(
    { source: bitmap, flipY: false },
    { texture },
    { width, height },
  );

  if (!(source instanceof ImageBitmap)) {
    bitmap.close();
  }

  return { texture, width, height };
}

export function createIntermediateTexture(
  device: GPUDevice,
  width: number,
  height: number,
  format: GPUTextureFormat = DEFAULT_FORMAT,
): GPUTexture {
  return device.createTexture({
    size: { width, height, depthOrArrayLayers: 1 },
    format,
    usage: intermediateTextureUsage(),
  });
}
