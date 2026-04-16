import { describe, expect, it } from 'vitest';
import { PipelineCache } from '../src/pipeline/pipeline-cache.js';

const fakePipeline = (): GPUComputePipeline => ({}) as unknown as GPUComputePipeline;

describe('PipelineCache', () => {
  it('starts empty', () => {
    const c = new PipelineCache();
    expect(c.size).toBe(0);
    expect(c.has('x')).toBe(false);
    expect(c.get('x')).toBeUndefined();
  });

  it('stores and retrieves pipelines by key', () => {
    const c = new PipelineCache();
    const p = fakePipeline();
    c.set('a', p);
    expect(c.has('a')).toBe(true);
    expect(c.get('a')).toBe(p);
    expect(c.size).toBe(1);
  });

  it('getOrCreate calls factory only on miss', () => {
    const c = new PipelineCache();
    let calls = 0;
    const factory = (): GPUComputePipeline => {
      calls++;
      return fakePipeline();
    };
    const a = c.getOrCreate('k', factory);
    const b = c.getOrCreate('k', factory);
    const d = c.getOrCreate('other', factory);
    expect(calls).toBe(2);
    expect(a).toBe(b);
    expect(d).not.toBe(a);
    expect(c.size).toBe(2);
  });

  it('tracks hits and misses', () => {
    const c = new PipelineCache();
    c.getOrCreate('a', fakePipeline);
    c.getOrCreate('a', fakePipeline);
    c.getOrCreate('a', fakePipeline);
    expect(c.misses).toBe(1);
    expect(c.hits).toBe(2);
  });

  it('clear empties the cache', () => {
    const c = new PipelineCache();
    c.set('a', fakePipeline());
    c.set('b', fakePipeline());
    expect(c.size).toBe(2);
    c.clear();
    expect(c.size).toBe(0);
  });
});
