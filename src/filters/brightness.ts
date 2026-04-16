import { ErrorCode, PixflowError } from '../errors.js';
import { BRIGHTNESS_WGSL } from '../shaders/brightness.wgsl.js';
import { ComputeFilter, type ComputeFilterShape } from './compute-filter.js';

export interface BrightnessParams {
  readonly amount: number;
}

const SHAPE: ComputeFilterShape<BrightnessParams> = {
  name: 'brightness',
  wgsl: BRIGHTNESS_WGSL,
  entryPoint: 'main',
  uniformByteLength: 4,
  writeUniforms(view, params): void {
    view.setFloat32(0, params.amount, true);
  },
  hashSuffix(params) {
    return `amount=${params.amount.toFixed(4)}`;
  },
};

export class BrightnessFilter extends ComputeFilter<BrightnessParams> {
  protected readonly shape = SHAPE;

  constructor(params: BrightnessParams) {
    if (!Number.isFinite(params.amount) || params.amount < -1 || params.amount > 1) {
      throw new PixflowError(
        ErrorCode.INVALID_INPUT,
        `brightness.amount must be a finite number in [-1, 1]; got ${String(params.amount)}.`,
      );
    }
    super('brightness', params);
  }

  override get isIdentity(): boolean {
    return this.params.amount === 0;
  }
}
