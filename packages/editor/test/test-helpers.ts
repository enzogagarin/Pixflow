import { vi } from 'vitest';
import type { Pipeline } from 'pixflow';
import type { EditState } from '../src/state/types';

/**
 * Mock Pipeline factory for adapter tests. Each method returns `this`
 * (the mock object) so fluent chains work. `vi.fn()` records every call
 * so tests can assert method name + arguments.
 */
export function createMockPipeline(): MockPipeline {
  const mock: MockPipeline = {
    crop: vi.fn(() => mock),
    rotate90: vi.fn(() => mock),
    flip: vi.fn(() => mock),
    brightness: vi.fn(() => mock),
    contrast: vi.fn(() => mock),
    saturation: vi.fn(() => mock),
    whiteBalance: vi.fn(() => mock),
    unsharpMask: vi.fn(() => mock),
    gaussianBlur: vi.fn(() => mock),
    watermark: vi.fn(() => mock),
    resize: vi.fn(() => mock),
    encode: vi.fn(() => mock),
  };
  return mock;
}

export interface MockPipeline {
  crop: ReturnType<typeof vi.fn>;
  rotate90: ReturnType<typeof vi.fn>;
  flip: ReturnType<typeof vi.fn>;
  brightness: ReturnType<typeof vi.fn>;
  contrast: ReturnType<typeof vi.fn>;
  saturation: ReturnType<typeof vi.fn>;
  whiteBalance: ReturnType<typeof vi.fn>;
  unsharpMask: ReturnType<typeof vi.fn>;
  gaussianBlur: ReturnType<typeof vi.fn>;
  watermark: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  encode: ReturnType<typeof vi.fn>;
}

/**
 * Build a minimal EditState for tests without needing a real ImageBitmap.
 * The adapter doesn't read source.bitmap/file/exif — only geometry/color/
 * detail/watermark/faceBlur/output — so a dummy source is safe.
 */
export function makeState(overrides: Partial<EditState> = {}): EditState {
  const base: EditState = {
    source: {
      bitmap: {} as unknown as ImageBitmap,
      file: {} as unknown as File,
      exif: {},
      naturalWidth: 4000,
      naturalHeight: 3000,
    },
    geometry: {
      crop: null,
      rotate: 0,
      flip: { h: false, v: false },
    },
    color: {
      brightness: 0,
      contrast: 0,
      saturation: 0,
      whiteBalance: { temperature: 0, tint: 0 },
    },
    detail: { sharpen: null, blur: null },
    watermark: null,
    faceBlur: null,
    output: {
      resize: null,
      format: 'image/webp',
      quality: 0.9,
      metadataStrip: { mode: 'aggressive' },
    },
  };
  return { ...base, ...overrides };
}

/**
 * Cast helper. The adapter accepts a factory `() => Pipeline`; tests need
 * to hand over a MockPipeline while the type signature expects Pipeline.
 */
export function asPipelineFactory(mock: MockPipeline): () => Pipeline {
  return () => mock as unknown as Pipeline;
}
