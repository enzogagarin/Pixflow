import { describe, it, expect } from 'vitest';
import { applyPreset } from '../src/state/presets';
import { makeState } from './test-helpers';

describe('applyPreset', () => {
  it("applies forum-post: inside-fit resize to 1200 + mild sharpen, keeps webp", () => {
    const s = applyPreset(makeState(), 'forum-post');
    expect(s.output.resize).toEqual({ maxWidth: 1200, fit: 'inside' });
    expect(s.detail.sharpen).toEqual({ amount: 0.3, radius: 1 });
    expect(s.output.format).toBe('image/webp');
  });

  it('applies ecommerce-thumbnail: 600x600 cover + stronger sharpen', () => {
    const s = applyPreset(makeState(), 'ecommerce-thumbnail');
    expect(s.output.resize).toEqual({ maxWidth: 600, maxHeight: 600, fit: 'cover' });
    expect(s.detail.sharpen).toEqual({ amount: 0.5, radius: 1 });
  });

  it('applies blog-hero: 1600x900 cover + saturation boost + mild sharpen', () => {
    const s = applyPreset(makeState(), 'blog-hero');
    expect(s.output.resize).toEqual({ maxWidth: 1600, maxHeight: 900, fit: 'cover' });
    expect(s.color.saturation).toBeCloseTo(0.1);
    expect(s.detail.sharpen).toEqual({ amount: 0.25, radius: 1 });
  });

  it('applies avatar: 256x256 cover + stronger sharpen', () => {
    const s = applyPreset(makeState(), 'avatar');
    expect(s.output.resize).toEqual({ maxWidth: 256, maxHeight: 256, fit: 'cover' });
    expect(s.detail.sharpen).toEqual({ amount: 0.4, radius: 1 });
  });

  it("preserves fields the preset doesn't mention (e.g. user's metadata strip choice)", () => {
    const base = makeState({
      output: {
        resize: null,
        format: 'image/webp',
        quality: 0.9,
        metadataStrip: { mode: 'preserve' },
      },
    });
    const s = applyPreset(base, 'forum-post');
    expect(s.output.metadataStrip.mode).toBe('preserve');
  });

  it('does not mutate the input state', () => {
    const base = makeState();
    const before = JSON.stringify({ ...base, source: null });
    applyPreset(base, 'avatar');
    const after = JSON.stringify({ ...base, source: null });
    expect(after).toBe(before);
  });
});
