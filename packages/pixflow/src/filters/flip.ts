import { ErrorCode, PixflowError } from '../errors.js';
import { FLIP_WGSL } from '../shaders/flip.wgsl.js';
import { ComputeFilter, type ComputeFilterShape } from './compute-filter.js';

export type FlipAxis = 'h' | 'v' | 'both';

export interface FlipParams {
  readonly axis: FlipAxis;
}

const SHAPE: ComputeFilterShape<FlipParams> = {
  name: 'flip',
  wgsl: FLIP_WGSL,
  entryPoint: 'main',
  uniformByteLength: 16,
  writeUniforms(view, params, _input, output): void {
    const flipX = params.axis === 'h' || params.axis === 'both' ? 1 : 0;
    const flipY = params.axis === 'v' || params.axis === 'both' ? 1 : 0;
    view.setUint32(0, output.width, true);
    view.setUint32(4, output.height, true);
    view.setUint32(8, flipX, true);
    view.setUint32(12, flipY, true);
  },
  hashSuffix(params): string {
    return `axis=${params.axis}`;
  },
};

export class FlipFilter extends ComputeFilter<FlipParams> {
  protected readonly shape = SHAPE;

  constructor(params: FlipParams) {
    if (params.axis !== 'h' && params.axis !== 'v' && params.axis !== 'both') {
      throw new PixflowError(
        ErrorCode.INVALID_INPUT,
        `flip.axis must be 'h', 'v', or 'both'; got ${String(params.axis)}.`,
      );
    }
    super('flip', params);
  }
}
