import { ErrorCode, PixflowError } from '../errors.js';
import { COLOR_MATRIX_WGSL } from '../shaders/color-matrix.wgsl.js';
import { ComputeFilter, type ComputeFilterShape } from './compute-filter.js';

/**
 * Row-major 4x4 transform applied to (R, G, B, A). Optional 4-vector bias is
 * added after the multiply, matching the CSS `feColorMatrix` element shape.
 */
export interface ColorMatrixParams {
  readonly matrix: readonly number[];
  readonly bias?: readonly [number, number, number, number];
}

const SHAPE: ComputeFilterShape<ColorMatrixParams> = {
  name: 'colorMatrix',
  wgsl: COLOR_MATRIX_WGSL,
  entryPoint: 'main',
  // mat4x4<f32> = 64 bytes, vec4<f32> bias = 16 bytes
  uniformByteLength: 64 + 16,
  writeUniforms(view, params): void {
    // Caller hands us row-major (m00 m01 m02 m03 m10 ...) so it reads naturally
    // when written inline. WGSL expects column-major in memory; transpose here
    // once per upload.
    const m = params.matrix;
    for (let col = 0; col < 4; col++) {
      for (let row = 0; row < 4; row++) {
        view.setFloat32((col * 4 + row) * 4, m[row * 4 + col] ?? 0, true);
      }
    }
    const bias = params.bias ?? [0, 0, 0, 0];
    view.setFloat32(64 + 0, bias[0], true);
    view.setFloat32(64 + 4, bias[1], true);
    view.setFloat32(64 + 8, bias[2], true);
    view.setFloat32(64 + 12, bias[3], true);
  },
  hashSuffix(params): string {
    const m = params.matrix.map((v) => v.toFixed(4)).join(',');
    const b = (params.bias ?? [0, 0, 0, 0]).map((v) => v.toFixed(4)).join(',');
    return `m=${m}|b=${b}`;
  },
};

export class ColorMatrixFilter extends ComputeFilter<ColorMatrixParams> {
  protected readonly shape = SHAPE;

  constructor(params: ColorMatrixParams) {
    if (!Array.isArray(params.matrix) || params.matrix.length !== 16) {
      throw new PixflowError(
        ErrorCode.INVALID_INPUT,
        `colorMatrix.matrix must be a 16-element row-major 4x4 array; got length ${String(params.matrix?.length)}.`,
      );
    }
    for (const v of params.matrix) {
      if (!Number.isFinite(v)) {
        throw new PixflowError(
          ErrorCode.INVALID_INPUT,
          'colorMatrix.matrix entries must all be finite numbers.',
        );
      }
    }
    if (params.bias !== undefined) {
      if (!Array.isArray(params.bias) || params.bias.length !== 4) {
        throw new PixflowError(
          ErrorCode.INVALID_INPUT,
          'colorMatrix.bias must be a 4-element vector when provided.',
        );
      }
      for (const v of params.bias) {
        if (!Number.isFinite(v)) {
          throw new PixflowError(
            ErrorCode.INVALID_INPUT,
            'colorMatrix.bias entries must all be finite numbers.',
          );
        }
      }
    }
    super('colorMatrix', params);
  }

  override get isIdentity(): boolean {
    const bias = this.params.bias ?? [0, 0, 0, 0];
    if (bias.some((v) => v !== 0)) return false;
    const m = this.params.matrix;
    for (let i = 0; i < 16; i++) {
      const expected = i % 5 === 0 ? 1 : 0;
      if (m[i] !== expected) return false;
    }
    return true;
  }
}

/** Identity 4x4 matrix — handy for tests and as a starting point for tweaks. */
export const IDENTITY_MATRIX: readonly number[] = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
];

/** Standard luminance grayscale matrix (Rec. 709 weights). */
export const GRAYSCALE_MATRIX: readonly number[] = [
  0.2126, 0.7152, 0.0722, 0,
  0.2126, 0.7152, 0.0722, 0,
  0.2126, 0.7152, 0.0722, 0,
  0, 0, 0, 1,
];

/** Classic sepia tone matrix. */
export const SEPIA_MATRIX: readonly number[] = [
  0.393, 0.769, 0.189, 0,
  0.349, 0.686, 0.168, 0,
  0.272, 0.534, 0.131, 0,
  0, 0, 0, 1,
];
