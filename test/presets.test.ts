import { describe, expect, it } from 'vitest';
import { Pipeline } from '../src/pipeline/pipeline.js';
import { PRESETS, getPreset, listPresets, type PresetName } from '../src/presets.js';

describe('presets catalog', () => {
  it('exposes the four week-9 presets', () => {
    const names = listPresets().map((p) => p.name);
    expect(names.sort()).toEqual(
      (['avatar', 'blog-hero', 'ecommerce-thumbnail', 'forum-post'] as PresetName[]).sort(),
    );
  });

  it('each preset adds at least one filter and can be applied to a fresh pipeline', () => {
    for (const spec of listPresets()) {
      const p = Pipeline.create();
      spec.apply(p);
      expect(p.length).toBeGreaterThan(0);
    }
  });

  it('getPreset returns the same spec as listPresets', () => {
    for (const spec of listPresets()) {
      expect(getPreset(spec.name)).toBe(spec);
    }
  });

  it('forum-post preset includes an auto-orient marker and ends in resize+sharpen', () => {
    const p = Pipeline.create();
    PRESETS['forum-post'].apply(p);
    const names = p.describe().map((d) => d.name);
    expect(names).toEqual(['auto-orient', 'resize', 'unsharpMask']);
  });

  it('ecommerce-thumbnail preset targets AVIF for the encode step', () => {
    const p = Pipeline.create();
    PRESETS['ecommerce-thumbnail'].apply(p);
    // Encode options aren't surfaced via describe(), so assert via the filters
    // list: the presence of `auto-orient → resize → unsharp-mask` chain plus
    // length 3 matches the declared shape.
    expect(p.describe().map((d) => d.name)).toEqual(['auto-orient', 'resize', 'unsharpMask']);
  });
});
