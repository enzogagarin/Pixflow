import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Pipeline } from 'pixflow';
import { PreviewEngine } from '../src/preview/preview-engine';
import { makeState, makeBitmap, createMockPipeline, type MockPipeline } from './test-helpers';

interface RunCall {
  signal: AbortSignal | undefined;
}

let mockPipeline: MockPipeline & { run: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> };
let runCalls: RunCall[];

beforeEach(() => {
  vi.useFakeTimers();
  // vitest's node env doesn't ship rAF; polyfill via setTimeout.
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
    setTimeout(() => cb(performance.now()), 16) as unknown as number);
  globalThis.cancelAnimationFrame = ((handle: number) =>
    clearTimeout(handle as unknown as ReturnType<typeof setTimeout>));
  const base = createMockPipeline();
  runCalls = [];
  const run = vi.fn(async (_src: ImageBitmap, opts: { signal?: AbortSignal } = {}) => {
    runCalls.push({ signal: opts.signal });
    await new Promise((r) => setTimeout(r, 10));
    return { blob: new Blob(), width: 100, height: 100, stats: {} };
  });
  const dispose = vi.fn();
  mockPipeline = Object.assign(base, { run, dispose }) as typeof mockPipeline;
});

afterEach(() => {
  vi.useRealTimers();
});

const fakeDevice = {} as unknown as GPUDevice;
const fakeCanvas = {} as unknown as HTMLCanvasElement;

function makeEngine(): PreviewEngine {
  return new PreviewEngine({
    canvas: fakeCanvas,
    previewBitmap: makeBitmap('preview'),
    device: fakeDevice,
    pipelineFactory: () => mockPipeline as unknown as Pipeline,
  });
}

describe('PreviewEngine.requestRender', () => {
  it('runs the pipeline once for the initial state', async () => {
    const engine = makeEngine();
    engine.requestRender(makeState());
    await vi.advanceTimersByTimeAsync(50);
    expect(runCalls).toHaveLength(1);
  });

  it('short-circuits when the same state reference is passed twice', async () => {
    const engine = makeEngine();
    const s = makeState();
    engine.requestRender(s);
    engine.requestRender(s);
    await vi.advanceTimersByTimeAsync(50);
    expect(runCalls).toHaveLength(1);
  });

  it('aborts the previous render signal when a newer state arrives', async () => {
    const engine = makeEngine();
    const s1 = makeState({
      color: { brightness: 0.1, contrast: 0, saturation: 0, whiteBalance: { temperature: 0, tint: 0 } },
    });
    const s2 = makeState({
      color: { brightness: 0.2, contrast: 0, saturation: 0, whiteBalance: { temperature: 0, tint: 0 } },
    });
    engine.requestRender(s1);
    // advance past rAF + into the run() await so the first signal is captured
    await vi.advanceTimersByTimeAsync(20);
    engine.requestRender(s2);
    await vi.advanceTimersByTimeAsync(50);
    expect(runCalls.length).toBeGreaterThanOrEqual(1);
    expect(runCalls[0]?.signal?.aborted).toBe(true);
    expect(runCalls[runCalls.length - 1]?.signal?.aborted).toBe(false);
  });

  it('dispose() aborts any in-flight render and ignores subsequent requests', async () => {
    const engine = makeEngine();
    engine.requestRender(makeState());
    await vi.advanceTimersByTimeAsync(20);
    engine.dispose();
    engine.requestRender(
      makeState({
        color: {
          brightness: 0.5,
          contrast: 0,
          saturation: 0,
          whiteBalance: { temperature: 0, tint: 0 },
        },
      }),
    );
    await vi.advanceTimersByTimeAsync(50);
    expect(runCalls[0]?.signal?.aborted).toBe(true);
    expect(runCalls).toHaveLength(1);
  });
});
