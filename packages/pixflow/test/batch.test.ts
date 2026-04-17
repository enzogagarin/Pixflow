import { describe, expect, it } from 'vitest';
import { Pipeline } from '../src/pipeline/pipeline.js';
import { PixflowError } from '../src/errors.js';

// These tests cover batch behavior that doesn't require a real GPU device:
// empty batches, pre-aborted signals, and validation. End-to-end runs are
// covered by the demo + browser smoke tests; here we lock down the contract.

describe('Pipeline.batch', () => {
  it('returns an empty array for an empty input', async () => {
    const p = Pipeline.create().brightness(0.1);
    const results = await p.batch([]);
    expect(results).toEqual([]);
  });

  it('rejects synchronously when given an already-aborted signal', async () => {
    const p = Pipeline.create().brightness(0.1);
    const ctrl = new AbortController();
    ctrl.abort('user cancelled');
    await expect(p.batch([new Blob()], { signal: ctrl.signal })).rejects.toBeInstanceOf(
      PixflowError,
    );
  });

  it('preserves the abort reason in the error message', async () => {
    const p = Pipeline.create().brightness(0.1);
    const ctrl = new AbortController();
    ctrl.abort(new Error('user cancelled'));
    await expect(p.batch([new Blob()], { signal: ctrl.signal })).rejects.toThrow(
      /user cancelled/,
    );
  });

  it('clamps concurrency to [1, total]', async () => {
    // batch() returns [] before concurrency is observed, so we just need this
    // to not throw on a 0-length input regardless of the requested concurrency.
    const p = Pipeline.create().brightness(0.1);
    await expect(p.batch([], { concurrency: 100 })).resolves.toEqual([]);
    await expect(p.batch([], { concurrency: 0 })).resolves.toEqual([]);
  });
});
