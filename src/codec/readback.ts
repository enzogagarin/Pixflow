import { ErrorCode, PixflowError } from '../errors.js';
import type { EncodeOptions } from '../types.js';
import { encodeCanvas, type EncodeRequest, type EncodeResult } from './encode.js';

export interface ReadbackOptions extends EncodeOptions {
  readonly canvas?: HTMLCanvasElement | OffscreenCanvas;
}

export async function textureToBlob(
  device: GPUDevice,
  texture: GPUTexture,
  options: ReadbackOptions = {},
): Promise<EncodeResult> {
  const width = texture.width;
  const height = texture.height;

  const canvas = options.canvas ?? pickCanvas(width, height);
  resizeCanvas(canvas, width, height);
  const pixels = await readTexturePixels(device, texture);
  writePixelsToCanvas(canvas, pixels, width, height);

  const request: { format?: NonNullable<EncodeOptions['format']>; quality?: number } = {};
  if (options.format !== undefined) request.format = options.format;
  if (options.quality !== undefined) request.quality = options.quality;
  return encodeCanvas(canvas, request as EncodeRequest);
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

async function readTexturePixels(
  device: GPUDevice,
  texture: GPUTexture,
): Promise<Uint8ClampedArray> {
  const width = texture.width;
  const height = texture.height;
  const bytesPerPixel = 4;
  const packedBytesPerRow = width * bytesPerPixel;
  const bytesPerRow = alignTo(packedBytesPerRow, 256);
  const buffer = device.createBuffer({
    label: 'pixflow.readback.buffer',
    size: bytesPerRow * height,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  try {
    const encoder = device.createCommandEncoder({ label: 'pixflow.readback' });
    encoder.copyTextureToBuffer(
      { texture },
      { buffer, bytesPerRow, rowsPerImage: height },
      { width, height, depthOrArrayLayers: 1 },
    );
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    await buffer.mapAsync(GPUMapMode.READ);

    const mapped = new Uint8Array(buffer.getMappedRange());
    const pixels = new Uint8ClampedArray(width * height * bytesPerPixel);
    for (let y = 0; y < height; y++) {
      const srcStart = y * bytesPerRow;
      const srcEnd = srcStart + packedBytesPerRow;
      const dstStart = y * packedBytesPerRow;
      pixels.set(mapped.subarray(srcStart, srcEnd), dstStart);
    }
    return pixels;
  } finally {
    if ((buffer as { mapState?: GPUBufferMapState }).mapState === 'mapped') {
      buffer.unmap();
    }
    buffer.destroy();
  }
}

function writePixelsToCanvas(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): void {
  normalizeSuspiciousAlpha(pixels);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) {
    throw new PixflowError(
      ErrorCode.INTERNAL,
      'Failed to obtain a 2D context from the readback canvas.',
    );
  }
  const image = ctx.createImageData(width, height);
  image.data.set(pixels);
  ctx.putImageData(image, 0, 0);
}

function alignTo(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}

function normalizeSuspiciousAlpha(pixels: Uint8ClampedArray): void {
  let alphaSum = 0;
  let colorSum = 0;
  let coloredPixels = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i] ?? 0;
    const g = pixels[i + 1] ?? 0;
    const b = pixels[i + 2] ?? 0;
    const a = pixels[i + 3] ?? 0;
    alphaSum += a;
    colorSum += r + g + b;
    if (r !== 0 || g !== 0 || b !== 0) coloredPixels++;
  }

  const pixelCount = pixels.length / 4;
  if (pixelCount === 0) return;
  const avgAlpha = alphaSum / pixelCount;
  const avgColor = colorSum / (pixelCount * 3);

  // Some browser/GPU paths appear to preserve RGB but zero out alpha during
  // readback, which then encodes to a tiny transparent WebP. If the image has
  // meaningful color data but alpha is effectively all zero, treat it as
  // opaque so exported files remain usable.
  if (avgAlpha > 2 || avgColor < 8 || coloredPixels < pixelCount * 0.1) return;

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i] ?? 0;
    const g = pixels[i + 1] ?? 0;
    const b = pixels[i + 2] ?? 0;
    if (r !== 0 || g !== 0 || b !== 0) {
      pixels[i + 3] = 255;
    }
  }
}
