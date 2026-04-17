import type { FaceBox, LoadingPhase } from '@pixflow/editor-ml/face';

/**
 * Editor-side wrapper around `@pixflow/editor-ml/face`. Responsibilities:
 *   - Lazy (dynamic) import so the 10+MB ORT runtime never enters the
 *     main editor bundle — code-split happens at the `import(...)` call.
 *   - Single-flight session load: many "Auto-detect" clicks in quick
 *     succession share one prepareSession promise.
 *   - Expose a stable public API to React components (FaceBlurConfig)
 *     without leaking ort internals.
 *
 * Configure WASM paths on first use so `onnxruntime-web` loads its
 * binaries from the editor's own `/ort/` directory (same-origin, matches
 * the privacy-first posture set in the architecture spec).
 */
type FaceModule = typeof import('@pixflow/editor-ml/face');

export type { FaceBox, LoadingPhase };

export class FaceDetectService {
  private module: FaceModule | null = null;
  private loadingPromise: Promise<FaceModule> | null = null;

  async ensureLoaded(onProgress?: (phase: LoadingPhase) => void): Promise<FaceModule> {
    if (this.module) {
      onProgress?.('ready');
      return this.module;
    }
    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = (async () => {
      onProgress?.('fetching-runtime');
      const mod = await import('@pixflow/editor-ml/face');
      // vite-plugin-static-copy mounts ort assets under /ort/; passing a
      // base path lets ort fill in the individual filenames it needs.
      mod.configureWasmPaths('/ort/');
      await mod.prepareSession({ ...(onProgress ? { onProgress } : {}) });
      this.module = mod;
      return mod;
    })();

    try {
      return await this.loadingPromise;
    } catch (err) {
      this.loadingPromise = null;
      throw err;
    }
  }

  async detect(
    bitmap: ImageBitmap,
    options: {
      onProgress?: (phase: LoadingPhase) => void;
      signal?: AbortSignal;
      minConfidence?: number;
    } = {},
  ): Promise<readonly FaceBox[]> {
    const mod = await this.ensureLoaded(options.onProgress);
    return mod.detectFaces(bitmap, {
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.minConfidence !== undefined ? { minConfidence: options.minConfidence } : {}),
    });
  }
}

/** Module-scope singleton — one service per page load. */
export const faceDetectService = new FaceDetectService();
