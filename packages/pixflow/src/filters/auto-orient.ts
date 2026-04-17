import { ErrorCode, PixflowError } from '../errors.js';
import type { Dims, Filter, FilterStage } from '../types.js';

/**
 * Sentinel filter used by `Pipeline.orient()` without an argument. At run()
 * time the pipeline reads the EXIF orientation of the source and replaces this
 * marker in place with the real rotate90/flip filters, so the user-declared
 * position of orient() in the chain is preserved (e.g. resize → auto-orient →
 * sharpen is honored).
 *
 * prepare/execute should never be called — the pipeline must expand the marker
 * before executing.
 */
export class AutoOrientFilter implements Filter<Record<string, never>> {
  readonly name = 'auto-orient';
  readonly params: Record<string, never> = {};
  readonly stage: FilterStage = 'cpu';

  prepare(): Promise<void> {
    throw new PixflowError(
      ErrorCode.INTERNAL,
      'AutoOrientFilter.prepare() called — pipeline should expand the marker before execution.',
    );
  }

  execute(): void {
    throw new PixflowError(
      ErrorCode.INTERNAL,
      'AutoOrientFilter.execute() called — pipeline should expand the marker before execution.',
    );
  }

  hash(): string {
    return 'auto-orient';
  }

  // outputSize is intentionally omitted; the marker is replaced before
  // computeStepDims walks the filter list.
  outputSize(input: Dims): Dims {
    return input;
  }
}
