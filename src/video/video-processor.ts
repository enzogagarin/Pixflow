import { ErrorCode, PixflowError } from '../errors.js';
import type { Pipeline } from '../pipeline/pipeline.js';
import type { PipelineResult } from '../types.js';

export interface ExtractedVideoFrame {
  readonly timestamp: number;
  readonly bitmap: ImageBitmap;
}

export type VideoFrame = ExtractedVideoFrame;

export interface ExtractFramesOptions {
  readonly intervalMs?: number;
  readonly maxFrames?: number;
}

export interface ProcessFramesOptions extends ExtractFramesOptions {
  readonly onProgress?: (
    done: number,
    total: number,
    result: PipelineResult,
    index: number,
    frame: ExtractedVideoFrame,
  ) => void;
}

export interface GenerateThumbnailsOptions {
  readonly count?: number;
  readonly width?: number;
}

interface VideoSession {
  readonly video: HTMLVideoElement;
  readonly durationMs: number;
  cleanup(): void;
}

const DEFAULT_INTERVAL_MS = 1000;
const DEFAULT_MAX_FRAMES = 60;
const DEFAULT_THUMB_COUNT = 6;
const DEFAULT_THUMB_WIDTH = 320;

export class VideoProcessor {
  static isSupported(): boolean {
    return (
      typeof document !== 'undefined' &&
      typeof VideoDecoder !== 'undefined' &&
      typeof createImageBitmap === 'function'
    );
  }

  async extractFrames(file: File, options: ExtractFramesOptions = {}): Promise<VideoFrame[]> {
    validateVideoFile(file);
    const intervalMs = validatePositiveNumber(options.intervalMs, DEFAULT_INTERVAL_MS, 'intervalMs');
    const maxFrames = validatePositiveInteger(options.maxFrames, DEFAULT_MAX_FRAMES, 'maxFrames');
    this.assertSupported();

    const session = await openVideo(file);
    try {
      const timestamps = intervalTimestamps(session.durationMs, intervalMs, maxFrames);
      const out: ExtractedVideoFrame[] = [];
      for (const ts of timestamps) {
        await seekVideo(session.video, ts / 1000);
        const bitmap = await createImageBitmap(session.video);
        out.push({ timestamp: ts, bitmap });
      }
      return out;
    } finally {
      session.cleanup();
    }
  }

  async processFrames(
    file: File,
    pipeline: Pipeline,
    options: ProcessFramesOptions = {},
  ): Promise<PipelineResult[]> {
    const frames = await this.extractFrames(file, options);
    const results: PipelineResult[] = [];
    try {
      for (const [index, frame] of frames.entries()) {
        const result = await pipeline.run(frame.bitmap);
        results.push(result);
        options.onProgress?.(results.length, frames.length, result, index, frame);
      }
      return results;
    } finally {
      for (const frame of frames) frame.bitmap.close();
    }
  }

  async generateThumbnails(file: File, options: GenerateThumbnailsOptions = {}): Promise<Blob[]> {
    validateVideoFile(file);
    const count = validatePositiveInteger(options.count, DEFAULT_THUMB_COUNT, 'count');
    const width = validatePositiveInteger(options.width, DEFAULT_THUMB_WIDTH, 'width');
    this.assertSupported();

    const session = await openVideo(file);
    try {
      const timestamps = evenlySpacedTimestamps(session.durationMs, count);
      const out: Blob[] = [];
      for (const ts of timestamps) {
        await seekVideo(session.video, ts / 1000);
        const bitmap = await createImageBitmap(session.video);
        try {
          out.push(await bitmapToBlob(bitmap, width));
        } finally {
          bitmap.close();
        }
      }
      return out;
    } finally {
      session.cleanup();
    }
  }

  private assertSupported(): void {
    if (VideoProcessor.isSupported()) return;
    throw new PixflowError(
      ErrorCode.WEBGPU_UNAVAILABLE,
      'Video processing requires browser WebCodecs support (VideoDecoder + createImageBitmap).',
    );
  }
}

function validateVideoFile(file: File): void {
  if (!file.type.startsWith('video/')) {
    throw new PixflowError(
      ErrorCode.INVALID_INPUT,
      `Expected a video file (type video/*), got ${file.type || 'unknown'}.`,
    );
  }
}

function validatePositiveNumber(value: number | undefined, fallback: number, name: string): number {
  const n = value ?? fallback;
  if (!Number.isFinite(n) || n <= 0) {
    throw new PixflowError(
      ErrorCode.INVALID_INPUT,
      `${name} must be a finite number greater than 0; got ${String(value)}.`,
    );
  }
  return n;
}

function validatePositiveInteger(value: number | undefined, fallback: number, name: string): number {
  const n = value ?? fallback;
  if (!Number.isInteger(n) || n <= 0) {
    throw new PixflowError(
      ErrorCode.INVALID_INPUT,
      `${name} must be an integer greater than 0; got ${String(value)}.`,
    );
  }
  return n;
}

async function openVideo(file: File): Promise<VideoSession> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'auto';
  video.playsInline = true;
  video.muted = true;
  video.src = url;

  try {
    await waitForEvent(video, 'loadedmetadata');
    if (!Number.isFinite(video.duration)) {
      throw new PixflowError(ErrorCode.INVALID_INPUT, 'Video metadata is missing duration.');
    }
    const durationMs = Math.max(0, Math.round(video.duration * 1000));
    return {
      video,
      durationMs,
      cleanup: () => {
        video.pause();
        video.removeAttribute('src');
        video.load();
        URL.revokeObjectURL(url);
      },
    };
  } catch (cause) {
    video.pause();
    URL.revokeObjectURL(url);
    if (PixflowError.is(cause)) throw cause;
    throw new PixflowError(ErrorCode.INVALID_INPUT, 'Failed to decode video metadata.', {
      cause,
    });
  }
}

function waitForEvent(
  video: HTMLVideoElement,
  event: 'loadedmetadata' | 'seeked',
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onDone = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(`video ${event} failed`));
    };
    const cleanup = () => {
      video.removeEventListener(event, onDone);
      video.removeEventListener('error', onError);
    };
    video.addEventListener(event, onDone, { once: true });
    video.addEventListener('error', onError, { once: true });
  });
}

async function seekVideo(video: HTMLVideoElement, seconds: number): Promise<void> {
  if (Math.abs(video.currentTime - seconds) < 0.001) return;
  video.currentTime = seconds;
  await waitForEvent(video, 'seeked');
}

function intervalTimestamps(durationMs: number, intervalMs: number, maxFrames: number): number[] {
  if (maxFrames === 1) return [0];
  if (durationMs <= 0) return [0].slice(0, maxFrames);
  const out: number[] = [];
  for (let t = 0; t < durationMs && out.length < maxFrames; t += intervalMs) {
    out.push(Math.round(t));
  }
  if (out.length === 0) out.push(0);
  return out;
}

function evenlySpacedTimestamps(durationMs: number, count: number): number[] {
  if (count === 1) return [Math.max(0, Math.round(durationMs / 2))];
  if (durationMs <= 0) return Array.from({ length: count }, () => 0);
  return Array.from({ length: count }, (_, i) => {
    const ratio = (i + 1) / (count + 1);
    return Math.round(durationMs * ratio);
  });
}

async function bitmapToBlob(bitmap: ImageBitmap, width: number): Promise<Blob> {
  const targetWidth = Math.max(1, Math.round(width));
  const targetHeight = Math.max(1, Math.round((bitmap.height / bitmap.width) * targetWidth));
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(targetWidth, targetHeight);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new PixflowError(ErrorCode.ENCODING_FAILED, 'Failed to create 2D canvas context.');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    return canvas.convertToBlob({ type: 'image/webp', quality: 0.85 });
  }

  if (typeof document === 'undefined') {
    throw new PixflowError(
      ErrorCode.ENCODING_FAILED,
      'Thumbnail generation requires OffscreenCanvas or HTMLCanvasElement support.',
    );
  }
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new PixflowError(ErrorCode.ENCODING_FAILED, 'Failed to create 2D canvas context.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new PixflowError(ErrorCode.ENCODING_FAILED, 'HTMLCanvasElement.toBlob returned null.'));
          return;
        }
        resolve(blob);
      },
      'image/webp',
      0.85,
    );
  });
}
