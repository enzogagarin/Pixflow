import { describe, expect, it } from 'vitest';
import { Pipeline } from '../src/pipeline/pipeline.js';
import { PixflowError } from '../src/errors.js';

describe('Pipeline builder', () => {
  it('creates an empty pipeline via Pipeline.create()', () => {
    const p = Pipeline.create();
    expect(p).toBeInstanceOf(Pipeline);
    expect(p.length).toBe(0);
  });

  it('chains brightness + contrast via fluent API', () => {
    const p = Pipeline.create().brightness(0.2).contrast(0.1);
    expect(p.length).toBe(2);
    const desc = p.describe();
    expect(desc[0]?.name).toBe('brightness');
    expect(desc[1]?.name).toBe('contrast');
  });

  it('accepts either a number or a params object for shorthand filters', () => {
    const a = Pipeline.create().brightness(0.25);
    const b = Pipeline.create().brightness({ amount: 0.25 });
    expect(a.describe()[0]?.hash).toBe(b.describe()[0]?.hash);
  });

  it('throws INVALID_INPUT when .run() is called with no filters', async () => {
    const p = Pipeline.create();
    await expect(p.run(new Blob())).rejects.toBeInstanceOf(PixflowError);
  });
});
