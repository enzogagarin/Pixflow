import { ErrorCode, PixflowError } from '../errors.js';
import { CROP_WGSL } from '../shaders/crop.wgsl.js';
import type { Dims } from '../types.js';
import { ComputeFilter, type ComputeFilterShape } from './compute-filter.js';

export interface CropParams {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const SHAPE: ComputeFilterShape<CropParams> = {
  name: 'crop',
  wgsl: CROP_WGSL,
  entryPoint: 'main',
  uniformByteLength: 16,
  writeUniforms(view, params): void {
    view.setUint32(0, params.x, true);
    view.setUint32(4, params.y, true);
    view.setUint32(8, params.width, true);
    view.setUint32(12, params.height, true);
  },
  hashSuffix(params): string {
    return `x=${params.x}|y=${params.y}|w=${params.width}|h=${params.height}`;
  },
};

export class CropFilter extends ComputeFilter<CropParams> {
  protected readonly shape = SHAPE;

  constructor(params: CropParams) {
    if (
      !Number.isInteger(params.x) ||
      !Number.isInteger(params.y) ||
      !Number.isInteger(params.width) ||
      !Number.isInteger(params.height) ||
      params.x < 0 ||
      params.y < 0 ||
      params.width <= 0 ||
      params.height <= 0
    ) {
      throw new PixflowError(
        ErrorCode.INVALID_INPUT,
        `crop requires non-negative integer x,y and positive integer width,height; got x=${params.x},y=${params.y},w=${params.width},h=${params.height}.`,
      );
    }
    super('crop', params);
  }

  outputSize(_input: Dims): Dims {
    return { width: this.params.width, height: this.params.height };
  }
}
