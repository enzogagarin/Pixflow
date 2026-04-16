import { ErrorCode, PixflowError } from '../errors.js';
import { WHITE_BALANCE_WGSL } from '../shaders/white-balance.wgsl.js';
import { ComputeFilter, type ComputeFilterShape } from './compute-filter.js';

export interface WhiteBalanceParams {
  /** Warm/cool shift in [-1, 1]. Positive warms (boost R, cut B). */
  readonly temperature?: number;
  /** Green/magenta shift in [-1, 1]. Positive shifts green, negative shifts magenta. */
  readonly tint?: number;
}

const SHAPE: ComputeFilterShape<WhiteBalanceParams> = {
  name: 'whiteBalance',
  wgsl: WHITE_BALANCE_WGSL,
  entryPoint: 'main',
  // vec3<f32> + f32 padding = 16 bytes
  uniformByteLength: 16,
  writeUniforms(view, params): void {
    const { gainR, gainG, gainB } = computeGain(params);
    view.setFloat32(0, gainR, true);
    view.setFloat32(4, gainG, true);
    view.setFloat32(8, gainB, true);
    view.setFloat32(12, 0, true);
  },
  hashSuffix(params): string {
    return `t=${(params.temperature ?? 0).toFixed(4)}|i=${(params.tint ?? 0).toFixed(4)}`;
  },
};

export class WhiteBalanceFilter extends ComputeFilter<WhiteBalanceParams> {
  protected readonly shape = SHAPE;

  override get isIdentity(): boolean {
    return (this.params.temperature ?? 0) === 0 && (this.params.tint ?? 0) === 0;
  }

  constructor(params: WhiteBalanceParams) {
    if (params.temperature !== undefined) {
      if (!Number.isFinite(params.temperature) || params.temperature < -1 || params.temperature > 1) {
        throw new PixflowError(
          ErrorCode.INVALID_INPUT,
          `whiteBalance.temperature must be a finite number in [-1, 1]; got ${String(params.temperature)}.`,
        );
      }
    }
    if (params.tint !== undefined) {
      if (!Number.isFinite(params.tint) || params.tint < -1 || params.tint > 1) {
        throw new PixflowError(
          ErrorCode.INVALID_INPUT,
          `whiteBalance.tint must be a finite number in [-1, 1]; got ${String(params.tint)}.`,
        );
      }
    }
    super('whiteBalance', params);
  }
}

/**
 * Translate the user-facing temperature/tint controls into per-channel gain
 * factors. Mapping is intentionally gentle (±50% at the extremes) — large
 * single-step shifts blow out highlights in 8-bit content; for bigger swings
 * users chain the filter or reach for `colorMatrix`.
 */
export function computeGain(
  params: WhiteBalanceParams,
): { gainR: number; gainG: number; gainB: number } {
  const t = params.temperature ?? 0;
  const i = params.tint ?? 0;
  return {
    gainR: 1 + t * 0.5,
    gainG: 1 - i * 0.5,
    gainB: 1 - t * 0.5,
  };
}
