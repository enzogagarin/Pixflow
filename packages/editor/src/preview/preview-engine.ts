import { Pipeline } from 'pixflow';
import { stateToPipeline } from '../render/state-to-pipeline';
import type { EditState } from '../state/types';

interface EngineOptions {
  readonly canvas: HTMLCanvasElement;
  readonly previewBitmap: ImageBitmap;
  readonly device: GPUDevice;
  /**
   * Factory used by stateToPipeline. Defaults to constructing a real
   * pixflow Pipeline that shares the editor's GPUDevice. Tests inject
   * a mock factory so they don't need a real GPU.
   */
  readonly pipelineFactory?: () => Pipeline;
}

/**
 * Drives the preview canvas. Each time requestRender(state) is called
 * with a new state reference, the engine schedules a render via
 * requestAnimationFrame. If a newer state arrives while one render is
 * in flight, the older render's AbortController is signalled and its
 * result is ignored. (Pixflow's single-shot run() doesn't honour an
 * abort signal mid-pipeline, so we cannot interrupt the GPU work — but
 * we do short-circuit before the destination canvas would otherwise
 * receive stale pixels.)
 *
 * The engine writes preview output by passing canvas to RunOptions:
 * pixflow's textureToBlob uses the supplied canvas as the readback 2D
 * scratch buffer (putImageData), so the canvas updates as a side
 * effect. We discard the returned blob — preview never leaves the page.
 */
export class PreviewEngine {
  private lastState: EditState | null = null;
  private currentAbort: AbortController | null = null;
  private rafHandle: number | null = null;
  private disposed = false;
  private readonly factory: () => Pipeline;

  constructor(private readonly opts: EngineOptions) {
    this.factory = opts.pipelineFactory ?? (() => Pipeline.create({ device: opts.device }));
  }

  requestRender(state: EditState): void {
    if (this.disposed) return;
    if (state === this.lastState) return;
    this.lastState = state;

    this.currentAbort?.abort();
    const abort = new AbortController();
    this.currentAbort = abort;

    if (this.rafHandle !== null) cancelAnimationFrame(this.rafHandle);
    this.rafHandle = requestAnimationFrame(() => {
      this.rafHandle = null;
      void this.renderFrame(state, abort.signal);
    });
  }

  private async renderFrame(state: EditState, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return;
    const pipeline = stateToPipeline(state, 'preview', this.factory);
    try {
      await pipeline.run(this.opts.previewBitmap, {
        canvas: this.opts.canvas,
        signal,
      } as Parameters<Pipeline['run']>[1]);
      if (signal.aborted) return;
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return;
      console.error('[PreviewEngine] render failed', err);
    } finally {
      pipeline.dispose();
    }
  }

  dispose(): void {
    this.disposed = true;
    this.currentAbort?.abort();
    this.currentAbort = null;
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
  }
}
