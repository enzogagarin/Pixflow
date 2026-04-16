import { ErrorCode, PixflowError } from '../errors.js';
import { SATURATION_WGSL } from '../shaders/saturation.wgsl.js';
import { ComputeFilter, type ComputeFilterShape } from './compute-filter.js';

export interface SaturationParams {
  readonly amount: number;
}

const SHAPE: ComputeFilterShape<SaturationParams> = {
  name: 'saturation',
  wgsl: SATURATION_WGSL,
  entryPoint: 'main',
  uniformByteLength: 4,
  writeUniforms(view, params): void {
    view.setFloat32(0, params.amount, true);
  },
  hashSuffix(params): string {
    return `amount=${params.amount.toFixed(4)}`;
  },
};

export class SaturationFilter extends ComputeFilter<SaturationParams> {
  protected readonly shape = SHAPE;

  constructor(params: SaturationParams) {
    if (!Number.isFinite(params.amount) || params.amount < -1 || params.amount > 1) {
      throw new PixflowError(
        ErrorCode.INVALID_INPUT,
        `saturation.amount must be a finite number in [-1, 1]; got ${String(params.amount)}.`,
      );
    }
    super('saturation', params);
  }
}
