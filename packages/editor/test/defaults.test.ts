import { describe, it, expect } from 'vitest';
import { freshState, isFreshEditState } from '../src/state/defaults';
import { makeState } from './test-helpers';

const dummyBitmap = {} as unknown as ImageBitmap;
const dummyFile = new File([], 'test.jpg', { type: 'image/jpeg' });

describe('freshState', () => {
  it('returns state with all filter params zeroed and outputs set to aggressive privacy defaults', () => {
    const s = freshState(dummyFile, dummyBitmap, {}, 4000, 3000);

    expect(s.source.file).toBe(dummyFile);
    expect(s.source.bitmap).toBe(dummyBitmap);
    expect(s.source.exif).toEqual({});
    expect(s.source.naturalWidth).toBe(4000);
    expect(s.source.naturalHeight).toBe(3000);

    expect(s.geometry).toEqual({
      crop: null,
      rotate: 0,
      flip: { h: false, v: false },
    });
    expect(s.color).toEqual({
      brightness: 0,
      contrast: 0,
      saturation: 0,
      whiteBalance: { temperature: 0, tint: 0 },
    });
    expect(s.detail).toEqual({ sharpen: null, blur: null });
    expect(s.watermark).toBeNull();
    expect(s.faceBlur).toBeNull();

    expect(s.output.resize).toBeNull();
    expect(s.output.format).toBe('image/webp');
    expect(s.output.quality).toBe(0.9);
    expect(s.output.metadataStrip.mode).toBe('aggressive');
  });

  it('reads naturalWidth/Height from args (not from bitmap)', () => {
    const s = freshState(dummyFile, dummyBitmap, {}, 1920, 1080);
    expect(s.source.naturalWidth).toBe(1920);
    expect(s.source.naturalHeight).toBe(1080);
  });
});

describe('isFreshEditState', () => {
  it('returns true for a freshly-built state', () => {
    expect(isFreshEditState(makeState())).toBe(true);
  });

  it('returns false when rotate is non-zero', () => {
    expect(
      isFreshEditState(
        makeState({ geometry: { crop: null, rotate: 90, flip: { h: false, v: false } } }),
      ),
    ).toBe(false);
  });

  it('returns false when flip h or v is set', () => {
    expect(
      isFreshEditState(
        makeState({ geometry: { crop: null, rotate: 0, flip: { h: true, v: false } } }),
      ),
    ).toBe(false);
  });

  it('returns false when any color slider is non-zero', () => {
    expect(
      isFreshEditState(
        makeState({
          color: {
            brightness: 0.1,
            contrast: 0,
            saturation: 0,
            whiteBalance: { temperature: 0, tint: 0 },
          },
        }),
      ),
    ).toBe(false);
  });

  it('returns false when whiteBalance temp or tint is non-zero', () => {
    expect(
      isFreshEditState(
        makeState({
          color: {
            brightness: 0,
            contrast: 0,
            saturation: 0,
            whiteBalance: { temperature: 0.2, tint: 0 },
          },
        }),
      ),
    ).toBe(false);
  });

  it('returns false when detail or watermark is set', () => {
    expect(
      isFreshEditState(
        makeState({ detail: { sharpen: { amount: 0.3, radius: 1 }, blur: null } }),
      ),
    ).toBe(false);
  });
});
