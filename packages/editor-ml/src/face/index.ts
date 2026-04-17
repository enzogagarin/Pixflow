import { preprocess } from './preprocess.js';
import { postprocess, type FaceBox, type PostprocessOptions } from './postprocess.js';
import {
  configureWasmPaths,
  prepareSession,
  runInference,
  type LoadingPhase,
  type PrepareOptions,
  type WasmPaths,
} from './session.js';

export interface DetectOptions extends PostprocessOptions {
  readonly signal?: AbortSignal;
}

/**
 * End-to-end face detection: preprocess bitmap → run inference →
 * postprocess to FaceBox[] in source-bitmap coords. Call prepareSession
 * first (it caches the session) or the first detectFaces call will
 * trigger it on demand.
 */
export async function detectFaces(
  bitmap: ImageBitmap,
  options: DetectOptions = {},
): Promise<readonly FaceBox[]> {
  if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  await prepareSession(options.signal ? { signal: options.signal } : {});
  if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const { tensor, letterbox } = preprocess(bitmap);
  const { scores, boxes } = await runInference(tensor);
  if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  return postprocess(scores, boxes, letterbox, options);
}

export {
  prepareSession,
  configureWasmPaths,
  type LoadingPhase,
  type PrepareOptions,
  type WasmPaths,
  type FaceBox,
  type PostprocessOptions,
};
