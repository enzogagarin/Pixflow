import { ErrorCode, PixflowError } from '../errors.js';
import type { EncodeOptions } from '../types.js';

const DEFAULT_FORMAT: NonNullable<EncodeOptions['format']> = 'image/png';

export interface ReadbackOptions extends EncodeOptions {
  readonly canvas?: HTMLCanvasElement | OffscreenCanvas;
}

export async function textureToBlob(
  device: GPUDevice,
  texture: GPUTexture,
  options: ReadbackOptions = {},
): Promise<Blob> {
  const width = texture.width;
  const height = texture.height;

  const canvas = options.canvas ?? pickCanvas(width, height);
  resizeCanvas(canvas, width, height);

  const ctx = canvas.getContext('webgpu') as GPUCanvasContext | null;
  if (!ctx) {
    throw new PixflowError(
      ErrorCode.INTERNAL,
      'Failed to obtain a WebGPU context from the readback canvas.',
    );
  }

  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({
    device,
    format: presentationFormat,
    alphaMode: 'premultiplied',
    usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });

  const currentTexture = ctx.getCurrentTexture();
  const encoder = device.createCommandEncoder({ label: 'pixflow.readback' });
  encoder.copyTextureToTexture(
    { texture },
    { texture: currentTexture },
    { width, height, depthOrArrayLayers: 1 },
  );
  device.queue.submit([encoder.finish()]);

  return canvasToBlob(canvas, options.format ?? DEFAULT_FORMAT, options.quality);
}

export function textureToCanvas(
  device: GPUDevice,
  texture: GPUTexture,
  canvas?: HTMLCanvasElement | OffscreenCanvas,
): HTMLCanvasElement | OffscreenCanvas {
  const width = texture.width;
  const height = texture.height;
  const target = canvas ?? pickCanvas(width, height);
  resizeCanvas(target, width, height);

  const ctx = target.getContext('webgpu') as GPUCanvasContext | null;
  if (!ctx) {
    throw new PixflowError(
      ErrorCode.INTERNAL,
      'Failed to obtain a WebGPU context from the target canvas.',
    );
  }
  ctx.configure({
    device,
    format: navigator.gpu.getPreferredCanvasFormat(),
    alphaMode: 'premultiplied',
    usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });
  const currentTexture = ctx.getCurrentTexture();
  const encoder = device.createCommandEncoder({ label: 'pixflow.toCanvas' });
  encoder.copyTextureToTexture(
    { texture },
    { texture: currentTexture },
    { width, height, depthOrArrayLayers: 1 },
  );
  device.queue.submit([encoder.finish()]);
  return target;
}

function pickCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    return c;
  }
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }
  throw new PixflowError(
    ErrorCode.INTERNAL,
    'No canvas implementation available in this environment.',
  );
}

function resizeCanvas(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  width: number,
  height: number,
): void {
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}

async function canvasToBlob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  type: string,
  quality: number | undefined,
): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    try {
      const opts: ImageEncodeOptions = { type };
      if (quality !== undefined) opts.quality = quality;
      return await canvas.convertToBlob(opts);
    } catch (cause) {
      throw new PixflowError(ErrorCode.ENCODING_FAILED, 'OffscreenCanvas.convertToBlob failed.', {
        cause,
      });
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
