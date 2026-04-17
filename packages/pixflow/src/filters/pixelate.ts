import { ErrorCode, PixflowError } from '../errors.js';
import { PIXELATE_WGSL } from '../shaders/pixelate.wgsl.js';
import { ComputeFilter, type ComputeFilterShape } from './compute-filter.js';

export interface Region {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface PixelateParams {
  readonly regions: readonly Region[];
  readonly blockSize: number;
}

export const MAX_REGIONS = 16;
const MIN_BLOCK_SIZE = 2;
const MAX_BLOCK_SIZE = 256;

const HEADER_BYTES = 16;
const REGION_BYTES = 16;
const UNIFORM_BYTES = HEADER_BYTES + MAX_REGIONS * REGION_BYTES;

function validateRegion(r: Region, i: number): void {
  const finite =
    Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.w) && Number.isFinite(r.h);
  if (!finite) {
    throw new PixflowError(
      ErrorCode.INVALID_INPUT,
      `pixelate/regionBlur region ${i} has non-finite coordinates.`,
    );
  }
  if (r.w <= 0 || r.h <= 0) {
    throw new PixflowError(
      ErrorCode.INVALID_INPUT,
      `pixelate/regionBlur region ${i} must have positive width and height; got ${r.w}×${r.h}.`,
    );
  }
}

export function validateRegions(regions: readonly Region[]): void {
  if (regions.length > MAX_REGIONS) {
    throw new PixflowError(
      ErrorCode.INVALID_INPUT,
      `pixelate/regionBlur supports at most ${MAX_REGIONS} regions; got ${regions.length}.`,
    );
  }
  regions.forEach(validateRegion);
}

export function writeRegionsUniform(
  view: DataView,
  regions: readonly Region[],
  extra: (view: DataView) => void,
): void {
  view.setUint32(0, regions.length, true);
  extra(view);
  let off = HEADER_BYTES;
  for (const r of regions) {
    view.setInt32(off + 0, Math.round(r.x), true);
    view.setInt32(off + 4, Math.round(r.y), true);
    view.setInt32(off + 8, Math.round(r.w), true);
    view.setInt32(off + 12, Math.round(r.h), true);
    off += REGION_BYTES;
  }
}

function regionsHash(regions: readonly Region[]): string {
  return regions.map((r) => `${r.x}/${r.y}/${r.w}/${r.h}`).join(';');
}

const SHAPE: ComputeFilterShape<PixelateParams> = {
  name: 'pixelate',
  wgsl: PIXELATE_WGSL,
  entryPoint: 'main',
  uniformByteLength: UNIFORM_BYTES,
  writeUniforms(view, params): void {
    writeRegionsUniform(view, params.regions, (v) => {
      v.setUint32(4, Math.round(params.blockSize), true);
    });
  },
  hashSuffix(params) {
    return `bs=${params.blockSize}|r=${regionsHash(params.regions)}`;
  },
};

export class PixelateFilter extends ComputeFilter<PixelateParams> {
  protected readonly shape = SHAPE;

  constructor(params: PixelateParams) {
    if (
      !Number.isFinite(params.blockSize) ||
      !Number.isInteger(params.blockSize) ||
      params.blockSize < MIN_BLOCK_SIZE ||
      params.blockSize > MAX_BLOCK_SIZE
    ) {
      throw new PixflowError(
        ErrorCode.INVALID_INPUT,
        `pixelate.blockSize must be an integer in [${MIN_BLOCK_SIZE}, ${MAX_BLOCK_SIZE}]; got ${String(params.blockSize)}.`,
      );
    }
    validateRegions(params.regions);
    super('pixelate', params);
  }

  override get isIdentity(): boolean {
    return this.params.regions.length === 0;
  }

  outputSize(input: { width: number; height: number }): { width: number; height: number } {
    return { width: input.width, height: input.height };
  }
}
