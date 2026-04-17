import { afterEach, describe, expect, it, vi } from 'vitest';
import { VideoProcessor } from '../src/video/video-processor.js';
import * as videoModule from '../src/video/index.js';
import * as rootModule from '../src/index.js';
import { ErrorCode, PixflowError } from '../src/errors.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('VideoProcessor', () => {
  it('can be constructed', () => {
    const processor = new VideoProcessor();
    expect(processor).toBeInstanceOf(VideoProcessor);
  });

  it('validates frame extraction options', async () => {
    const processor = new VideoProcessor();
    const video = new File(['fake'], 'clip.mp4', { type: 'video/mp4' });

    await expect(processor.extractFrames(video, { intervalMs: 0 })).rejects.toBeInstanceOf(
      PixflowError,
    );
    await expect(processor.extractFrames(video, { maxFrames: 0 })).rejects.toBeInstanceOf(
      PixflowError,
    );
  });

  it('detects support when WebCodecs globals are mocked', () => {
    expect(VideoProcessor.isSupported()).toBe(false);
    vi.stubGlobal('createImageBitmap', vi.fn());
    vi.stubGlobal('document', { createElement: vi.fn() });
    expect(VideoProcessor.isSupported()).toBe(true);
  });

  it('surfaces VIDEO_UNAVAILABLE when video APIs are missing', async () => {
    const processor = new VideoProcessor();
    const video = new File(['fake'], 'clip.mp4', { type: 'video/mp4' });

    await expect(processor.extractFrames(video)).rejects.toMatchObject({
      code: ErrorCode.VIDEO_UNAVAILABLE,
    });
  });
});

describe('video module exports', () => {
  it('exports VideoProcessor from src/video/index.ts', () => {
    expect(videoModule.VideoProcessor).toBe(VideoProcessor);
  });

  it('exports VideoProcessor from src/index.ts', () => {
    expect(rootModule.VideoProcessor).toBe(VideoProcessor);
  });
});
