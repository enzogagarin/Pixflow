import type { PresetName } from 'pixflow';
import type { EditState } from './types';

/**
 * Starting-point preset application. Merges preset-specific parameters
 * (resize, sharpen, saturation) onto an existing state; fields the preset
 * doesn't touch (user's metadata strip choice, crop, rotate, etc.) are
 * preserved. Presets match pixflow's `PRESETS` dictionary semantically
 * but express themselves as EditState patches rather than Pipeline calls.
 */
export function applyPreset(state: EditState, preset: PresetName): EditState {
  switch (preset) {
    case 'forum-post':
      return {
        ...state,
        detail: { ...state.detail, sharpen: { amount: 0.3, radius: 1 } },
        output: { ...state.output, resize: { maxWidth: 1200, fit: 'inside' } },
      };

    case 'ecommerce-thumbnail':
      return {
        ...state,
        detail: { ...state.detail, sharpen: { amount: 0.5, radius: 1 } },
        output: {
          ...state.output,
          resize: { maxWidth: 600, maxHeight: 600, fit: 'cover' },
        },
      };

    case 'blog-hero':
      return {
        ...state,
        color: { ...state.color, saturation: 0.1 },
        detail: { ...state.detail, sharpen: { amount: 0.25, radius: 1 } },
        output: {
          ...state.output,
          resize: { maxWidth: 1600, maxHeight: 900, fit: 'cover' },
        },
      };

    case 'avatar':
      return {
        ...state,
        detail: { ...state.detail, sharpen: { amount: 0.4, radius: 1 } },
        output: {
          ...state.output,
          resize: { maxWidth: 256, maxHeight: 256, fit: 'cover' },
        },
      };
  }
}
