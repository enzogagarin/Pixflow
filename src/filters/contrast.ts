import { ErrorCode, PixflowError } from '../errors.js';
import { CONTRAST_WGSL } from '../shaders/contrast.wgsl.js';
import { ComputeFilter, type ComputeFilterShape } from './compute-filter.js';

export interface ContrastParams {
  readonly amount: number;
}

const SHAPE: ComputeFilterShape<ContrastParams> = {
  name: 'contrast',
  wgsl: CONTRAST_WGSL,
  entryPoint: 'main',
  uniformByteLength: 4,
  writeUniforms(view, params): void {
    view.setFloat32(0, params.amount, true);
  },
  hashSuffix(params) {
    return `amount=${params.amount.toFixed(4)}`;
  },
};

export class ContrastFilter extends ComputeFilter<ContrastParams> {
  protected readonly shape = SHAPE;

  constructor(params: ContrastParams) {
    if (!Number.isFinite(params.amount) || params.amount < -1 || params.amount > 1) {
      throw new PixflowError(
        ErrorCode.INVALID_INPUT,
        `contrast.amount must be a finite number in [-1, 1]; got ${String(params.amount)}.`,
      );
    }
    super('contrast', params);
  }
}
