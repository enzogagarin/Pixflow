import { ErrorCode, PixflowError } from '../errors.js';
import { ROTATE90_WGSL } from '../shaders/rotate90.wgsl.js';
import type { Dims } from '../types.js';
import { ComputeFilter, type ComputeFilterShape } from './compute-filter.js';

export interface Rotate90Params {
  /** Number of 90-degree clockwise turns: 1, 2, or 3. */
  readonly turns: 1 | 2 | 3;
}

const SHAPE: ComputeFilterShape<Rotate90Params> = {
  name: 'rotate90',
  wgsl: ROTATE90_WGSL,
  entryPoint: 'main',
  uniformByteLength: 24,
  writeUniforms(view, params, inputDims, outputDims): void {
    view.setUint32(0, inputDims.width, true);
    view.setUint32(4, inputDims.height, true);
    view.setUint32(8, outputDims.width, true);
    view.setUint32(12, outputDims.height, true);
    view.setUint32(16, params.turns, true);
    view.setUint32(20, 0, true);
  },
  hashSuffix(params): string {
    return `t=${params.turns}`;
  },
};

export class Rotate90Filter extends ComputeFilter<Rotate90Params> {
  protected readonly shape = SHAPE;

  constructor(params: Rotate90Params) {
    if (params.turns !== 1 && params.turns !== 2 && params.turns !== 3) {
      throw new PixflowError(
        ErrorCode.INVALID_INPUT,
        `rotate90.turns must be 1, 2, or 3; got ${String(params.turns)}.`,
      );
    }
    super('rotate90', params);
  }

  outputSize(input: Dims): Dims {
    if (this.params.turns === 2) return input;
    return { width: input.height, height: input.width };
  }
}
