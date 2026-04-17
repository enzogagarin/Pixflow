import type { Pipeline } from './pipeline/pipeline.js';

export type PresetName = 'forum-post' | 'ecommerce-thumbnail' | 'blog-hero' | 'avatar';

export interface PresetSpec {
  readonly name: PresetName;
  readonly label: string;
  readonly description: string;
  /** Apply the preset's filters + encode settings to a pipeline. Returns the
   * same pipeline instance so callers can chain further customizations. */
  readonly apply: (pipeline: Pipeline) => Pipeline;
}

export const PRESETS: Record<PresetName, PresetSpec> = {
  'forum-post': {
    name: 'forum-post',
    label: 'Forum post',
    description: 'Auto-orient, downscale to 1200px, mild sharpen, WebP Q82.',
    apply: (p) =>
      p
        .orient()
        .resize({ width: 1200, fit: 'inside', withoutEnlargement: true })
        .unsharpMask({ amount: 0.3, radius: 1 })
        .encode({ format: 'image/webp', quality: 0.82 }),
  },
  'ecommerce-thumbnail': {
    name: 'ecommerce-thumbnail',
    label: 'Ecommerce thumbnail',
    description: 'Center-crop to 600×600, sharpen, AVIF Q70 (falls back to WebP).',
    apply: (p) =>
      p
        .orient()
        .resize({ width: 600, height: 600, fit: 'cover' })
        .unsharpMask({ amount: 0.5, radius: 1 })
        .encode({ format: 'image/avif', quality: 0.7 }),
  },
  'blog-hero': {
    name: 'blog-hero',
    label: 'Blog hero',
    description: '1600×900 cover crop, saturation +10%, WebP Q85.',
    apply: (p) =>
      p
        .orient()
        .resize({ width: 1600, height: 900, fit: 'cover' })
        .saturation(0.1)
        .unsharpMask({ amount: 0.25, radius: 1 })
        .encode({ format: 'image/webp', quality: 0.85 }),
  },
  avatar: {
    name: 'avatar',
    label: 'Avatar',
    description: '256×256 square cover, mild sharpen, WebP Q80.',
    apply: (p) =>
      p
        .orient()
        .resize({ width: 256, height: 256, fit: 'cover' })
        .unsharpMask({ amount: 0.4, radius: 1 })
        .encode({ format: 'image/webp', quality: 0.8 }),
  },
};

export function getPreset(name: PresetName): PresetSpec {
  return PRESETS[name];
}

export function listPresets(): readonly PresetSpec[] {
  return Object.values(PRESETS);
}
