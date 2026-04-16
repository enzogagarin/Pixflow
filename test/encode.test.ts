import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ENCODE_FORMAT,
  encodeCanvas,
  isAvifEncodingSupported,
  resetAvifSupportCache,
} from '../src/codec/encode.js';

afterEach(() => {
  resetAvifSupportCache();
  vi.unstubAllGlobals();
});

describe('DEFAULT_ENCODE_FORMAT', () => {
  it('is PNG to match the lossless-by-default contract', () => {
    expect(DEFAULT_ENCODE_FORMAT).toBe('image/png');
  });
});

describe('isAvifEncodingSupported', () => {
  it('returns false when OffscreenCanvas is unavailable', async () => {
    vi.stubGlobal('OffscreenCanvas', undefined);
    expect(await isAvifEncodingSupported()).toBe(false);
  });

  it('returns true when convertToBlob returns an AVIF blob', async () => {
    const fakeCtx = { fillStyle: '', fillRect: (): void => {} };
    class FakeCanvas {
      constructor(
        public width: number,
        public height: number,
      ) {}
      getContext(): unknown {
        return fakeCtx;
      }
      convertToBlob(): Promise<Blob> {
        return Promise.resolve(new Blob([new Uint8Array([0])], { type: 'image/avif' }));
      }
    }
    vi.stubGlobal('OffscreenCanvas', FakeCanvas);
    expect(await isAvifEncodingSupported()).toBe(true);
  });

  it('returns false when convertToBlob silently falls back to PNG', async () => {
    const fakeCtx = { fillStyle: '', fillRect: (): void => {} };
    class FakeCanvas {
      constructor(
        public width: number,
        public height: number,
      ) {}
      getContext(): unknown {
        return fakeCtx;
      }
      convertToBlob(): Promise<Blob> {
        return Promise.resolve(new Blob([new Uint8Array([0])], { type: 'image/png' }));
      }
    }
    vi.stubGlobal('OffscreenCanvas', FakeCanvas);
    expect(await isAvifEncodingSupported()).toBe(false);
  });
});

describe('encodeCanvas', () => {
  it('passes format + quality straight through for PNG/JPEG/WebP', async () => {
    const calls: { type: string; quality?: number }[] = [];
    const canvas = {
      convertToBlob: async (opts: ImageEncodeOptions) => {
        const entry: { type: string; quality?: number } = { type: opts.type ?? '' };
        if (opts.quality !== undefined) entry.quality = opts.quality;
        calls.push(entry);
        return new Blob([new Uint8Array([0])], { type: opts.type ?? '' });
      },
    } as unknown as OffscreenCanvas;

    const res = await encodeCanvas(canvas, { format: 'image/webp', quality: 0.82 });
    expect(res.format).toBe('image/webp');
    expect(res.blob.type).toBe('image/webp');
    expect(res.fallback).toBeUndefined();
    expect(calls).toEqual([{ type: 'image/webp', quality: 0.82 }]);
  });

  it('falls back to WebP when AVIF is unsupported, marking fallback on the result', async () => {
    const calls: string[] = [];
    const canvas = {
      convertToBlob: async (opts: ImageEncodeOptions) => {
        calls.push(opts.type ?? '');
        const outType = opts.type === 'image/avif' ? 'image/png' : (opts.type ?? '');
        return new Blob([new Uint8Array([0])], { type: outType });
      },
    } as unknown as OffscreenCanvas;

    // Force AVIF support cache to "not supported" without depending on globals.
    resetAvifSupportCache();
    vi.stubGlobal('OffscreenCanvas', undefined);

    const res = await encodeCanvas(canvas, { format: 'image/avif', quality: 0.7 });
    expect(res.format).toBe('image/webp');
    expect(res.fallback).toBe('image/webp');
    // Only the WebP call should have been issued since AVIF support probe
    // short-circuited to false.
    expect(calls).toEqual(['image/webp']);
  });
});
