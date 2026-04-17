import * as ort from 'onnxruntime-web';
import { fetchWithIntegrity, MODELS } from '../loader/index.js';

export type LoadingPhase =
  | 'fetching-runtime'
  | 'fetching-model'
  | 'verifying-model'
  | 'creating-session'
  | 'ready';

export interface PrepareOptions {
  readonly onProgress?: (phase: LoadingPhase) => void;
  readonly signal?: AbortSignal;
}

let session: ort.InferenceSession | null = null;
let loadingPromise: Promise<ort.InferenceSession> | null = null;

/**
 * Prepare the ONNX Runtime session: fetch + verify the UltraFace model,
 * hand it to ort, keep it as a module singleton. Subsequent calls
 * short-circuit once the session exists (single-flight latch).
 *
 * The WASM files that ort needs are expected at `/ort/` on the editor's
 * origin. Call `configureWasmPaths` once at app boot (editor does this
 * in its FaceDetectService wrapper) before invoking prepareSession.
 */
export async function prepareSession(options: PrepareOptions = {}): Promise<ort.InferenceSession> {
  if (session) {
    options.onProgress?.('ready');
    return session;
  }
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    options.onProgress?.('fetching-model');
    const signal = options.signal;
    const modelBytes = await fetchWithIntegrity(
      MODELS.ultraface,
      signal ? { signal } : {},
    );
    options.onProgress?.('verifying-model');

    options.onProgress?.('creating-session');
    const created = await ort.InferenceSession.create(modelBytes, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });
    session = created;
    options.onProgress?.('ready');
    return created;
  })();

  try {
    return await loadingPromise;
  } catch (err) {
    loadingPromise = null;
    throw err;
  }
}

/**
 * Run inference once. Assumes session was prepared; throws otherwise.
 * Returns raw output tensors; postprocess converts them into FaceBoxes.
 */
export async function runInference(
  tensor: Float32Array,
): Promise<{ scores: Float32Array; boxes: Float32Array }> {
  if (!session) {
    throw new Error('Face detection: call prepareSession() before runInference().');
  }
  const input = new ort.Tensor('float32', tensor, [1, 3, 240, 320]);
  const inputName = session.inputNames[0];
  if (!inputName) throw new Error('Face detection: model has no input tensor binding.');
  const outputs = await session.run({ [inputName]: input });

  // UltraFace returns two outputs; conventionally first is scores, second is boxes,
  // but we resolve by name when possible and fall back to ordering.
  const names = session.outputNames;
  const byName = (n: string) => (n in outputs ? outputs[n] : undefined);
  const scoresTensor =
    byName('scores') ?? (names[0] ? outputs[names[0]] : undefined);
  const boxesTensor = byName('boxes') ?? (names[1] ? outputs[names[1]] : undefined);
  if (!scoresTensor || !boxesTensor) {
    throw new Error(
      `Face detection: unexpected model outputs. Got ${JSON.stringify(names)}.`,
    );
  }
  return {
    scores: scoresTensor.data as Float32Array,
    boxes: boxesTensor.data as Float32Array,
  };
}

export interface WasmPaths {
  readonly mjs?: string;
  readonly wasm?: string;
}

/**
 * Configure ort's WASM asset URLs. Pass either a base path string
 * (ort resolves individual filenames against it) or an object mapping
 * file types to full URLs. The URLs-by-key form is what you want in
 * Vite: use `?url` imports on ort's dist files so the bundler produces
 * hashed, same-origin asset URLs; passing those here keeps inference
 * self-hosted and satisfies the "no third-party fetches" posture.
 *
 * MUST be called before prepareSession.
 */
export function configureWasmPaths(paths: WasmPaths | string): void {
  ort.env.wasm.wasmPaths = paths as string;
}

/** Test/HMR hook. Not part of the public API. */
export function __resetForTests(): void {
  session = null;
  loadingPromise = null;
}
