import { ErrorCode, PixflowError } from '../errors.js';
import { PAD_WGSL } from '../shaders/pad.wgsl.js';
import type { Dims } from '../types.js';
import { ComputeFilter, type ComputeFilterShape } from './compute-filter.js';

export interface PadColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a?: number;
}

export interface PadParams {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
  readonly color?: PadColor;
}

const SHAPE: ComputeFilterShape<PadParams> = {
  name: 'pad',
  wgsl: PAD_WGSL,
  entryPoint: 'main',
  // vec2u in_size + vec2u out_size + vec2u offset + (pad to 16) + vec4f color
  uniformByteLength: 8 + 8 + 8 + 8 + 16,
  writeUniforms(view, params, input, output): void {
    view.setUint32(0, input.width, true);
    view.setUint32(4, input.height, true);
    view.setUint32(8, output.width, true);
    view.setUint32(12, output.height, true);
    view.setUint32(16, params.left, true);
    view.setUint32(20, params.top, true);
    // pad to 16-byte alignment for vec4f
    view.setUint32(24, 0, true);
    view.setUint32(28, 0, true);
    const color = params.color ?? { r: 0, g: 0, b: 0, a: 1 };
    view.setFloat32(32, color.r, true);
    view.setFloat32(36, color.g, true);
    view.setFloat32(40, color.b, true);
    view.setFloat32(44, color.a ?? 1, true);
  },
  hashSuffix(params): string {
    const c = params.color ?? { r: 0, g: 0, b: 0, a: 1 };
    return `t=${params.top}|r=${params.right}|b=${params.bottom}|l=${params.left}|c=${c.r.toFixed(3)},${c.g.toFixed(3)},${c.b.toFixed(3)},${(c.a ?? 1).toFixed(3)}`;
  },
};

export class PadFilter extends ComputeFilter<PadParams> {
  protected readonly shape = SHAPE;

  constructor(params: PadParams) {
    for (const k of ['top', 'right', 'bottom', 'left'] as const) {
      const v = params[k];
      if (!Number.isInteger(v) || v < 0) {
        throw new PixflowError(
          ErrorCode.INVALID_INPUT,
          `pad.${k} must be a non-negative integer; got ${String(v)}.`,
        );
      }
    }
    super('pad', params);
  }

  outputSize(input: Dims): Dims {
    return {
      width: input.width + this.params.left + this.params.right,
      height: input.height + this.params.top + this.params.bottom,
    };
  }
}
