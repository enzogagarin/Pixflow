import { ErrorCode, PixflowError } from '../errors.js';
import { CURVES_WGSL } from '../shaders/curves.wgsl.js';
import { ComputeFilter, type ComputeFilterShape } from './compute-filter.js';

export type CurvePoint = readonly [input: number, output: number];

export interface CurvesParams {
  /**
   * Control points in input → output space, each component in [0, 1]. Points
   * are sorted by input value internally, then a 256-entry LUT is built by
   * piecewise linear interpolation. Defaults bracket the curve with (0, 0)
   * and (1, 1) so callers can pass just the interior knee.
   */
  readonly points: readonly CurvePoint[];
}

const LUT_ENTRIES = 256;
// 64 vec4s × 16 bytes — uniform buffers require 16-byte array stride.
const UNIFORM_BYTES = 64 * 16;

const SHAPE: ComputeFilterShape<CurvesParams> = {
  name: 'curves',
  wgsl: CURVES_WGSL,
  entryPoint: 'main',
  uniformByteLength: UNIFORM_BYTES,
  writeUniforms(view, params): void {
    const lut = buildLut(params.points);
    for (let i = 0; i < LUT_ENTRIES; i++) {
      view.setFloat32(i * 4, lut[i] ?? 0, true);
    }
  },
  hashSuffix(params): string {
    // Hash the canonicalized control points so two semantically-identical
    // curves share a pipeline cache slot but distinct curves don't collide.
    const sorted = sortPoints(params.points);
    return `pts=${sorted.map(([x, y]) => `${x.toFixed(4)},${y.toFixed(4)}`).join(';')}`;
  },
};

export class CurvesFilter extends ComputeFilter<CurvesParams> {
  protected readonly shape = SHAPE;

  override get isIdentity(): boolean {
    // A curve is identity iff every control point lies on y = x. Sub-sample
    // points can still define a non-linear curve between them, but those are
    // the only tests callers can express.
    for (const [x, y] of this.params.points) {
      if (Math.abs(x - y) > 1e-6) return false;
    }
    return true;
  }

  constructor(params: CurvesParams) {
    if (!Array.isArray(params.points) || params.points.length < 1) {
      throw new PixflowError(
        ErrorCode.INVALID_INPUT,
        'curves.points must be a non-empty array of [input, output] pairs.',
      );
    }
    for (const pt of params.points) {
      if (!Array.isArray(pt) || pt.length !== 2) {
        throw new PixflowError(
          ErrorCode.INVALID_INPUT,
          'curves.points entries must be [input, output] tuples.',
        );
      }
      const [x, y] = pt;
      if (!Number.isFinite(x) || x < 0 || x > 1) {
        throw new PixflowError(
          ErrorCode.INVALID_INPUT,
          `curves point input must be in [0, 1]; got ${String(x)}.`,
        );
      }
      if (!Number.isFinite(y) || y < 0 || y > 1) {
        throw new PixflowError(
          ErrorCode.INVALID_INPUT,
          `curves point output must be in [0, 1]; got ${String(y)}.`,
        );
      }
    }
    super('curves', params);
  }
}

function sortPoints(points: readonly CurvePoint[]): CurvePoint[] {
  return [...points].sort((a, b) => a[0] - b[0]);
}

/**
 * Build a 256-entry LUT by piecewise linear interpolation through the
 * supplied control points. Anchors (0, 0) and (1, 1) are added implicitly
 * unless the caller has already pinned those endpoints.
 */
export function buildLut(points: readonly CurvePoint[]): Float32Array {
  const sorted = sortPoints(points);
  const anchored: CurvePoint[] = [];
  if (sorted.length === 0 || sorted[0]![0] > 0) anchored.push([0, sorted[0]?.[1] ?? 0]);
  for (const p of sorted) anchored.push(p);
  if (anchored[anchored.length - 1]![0] < 1) {
    anchored.push([1, anchored[anchored.length - 1]![1] ?? 1]);
  }

  const lut = new Float32Array(LUT_ENTRIES);
  let segIndex = 0;
  for (let i = 0; i < LUT_ENTRIES; i++) {
    const x = i / (LUT_ENTRIES - 1);
    while (segIndex < anchored.length - 2 && x > anchored[segIndex + 1]![0]) segIndex++;
    const [x0, y0] = anchored[segIndex]!;
    const [x1, y1] = anchored[segIndex + 1]!;
    const t = x1 === x0 ? 0 : (x - x0) / (x1 - x0);
    const y = y0 + (y1 - y0) * t;
    lut[i] = Math.max(0, Math.min(1, y));
  }
  return lut;
}
