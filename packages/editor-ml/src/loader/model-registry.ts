import type { ModelSpec } from './types.js';

/**
 * Pinned same-origin model assets. SHA-256 values are compile-time
 * constants; flipping a byte in the model file on disk will cause
 * `fetchWithIntegrity` to throw at runtime. Regenerate the hash via
 * `pnpm --filter @pixflow/editor-ml generate-hash` whenever a model
 * binary is added, replaced, or updated.
 *
 * URL paths are **relative to the editor's origin**, served out of
 * `packages/editor/public/models/`. The editor-ml package doesn't
 * embed the model bytes itself; the editor application is the one
 * that ships them (same-origin, no CDN).
 */
export const MODELS = {
  /**
   * UltraFace RFB-320 — lightweight face detector.
   * Source: github.com/onnx/models/tree/main/validated/vision/body_analysis/ultraface
   * License: MIT.
   * Input: 1×3×240×320 RGB float32, normalized (pixel - 127) / 128.
   * Output: scores [1, 4420, 2], boxes [1, 4420, 4] in (x1,y1,x2,y2) normalized 0..1.
   */
  ultraface: {
    url: '/models/ultraface-rfb-320.onnx',
    sha256: '34cd7e60aeff28744c657de7a3dc64e872d506741de66987f3426f2b79f88017',
    size: 1270727,
  },
} as const satisfies Record<string, ModelSpec>;

export type ModelName = keyof typeof MODELS;
