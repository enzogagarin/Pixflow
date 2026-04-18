import { Pipeline } from 'pixflow';
import { produce } from 'immer';
import { stateToPipeline } from '../render/state-to-pipeline';
import type { EditState } from '../state/types';
import type { EditorContext } from '../context/editor-context';
import { buildZip } from './zip.js';

export interface BatchProgress {
  readonly done: number;
  readonly total: number;
  readonly currentFile: string;
}

export interface BatchResult {
  readonly zip: Blob;
  readonly count: number;
  readonly totalBytes: number;
  readonly durationMs: number;
  readonly errors: readonly { file: string; message: string }[];
}

const FORMAT_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

/**
 * Run the active EditState (stripped of face-blur, which is inherently
 * per-image) against every file in `files`, encoding each into the
 * format chosen in state.output, bundling the results into a single
 * ZIP archive, and returning it. Errors per file are captured in the
 * result (a single failure doesn't abort the batch — the ZIP ships
 * with whatever succeeded).
 *
 * Sequential by design: pixflow's GPU pipeline is stateful and the
 * editor's single device can't run two pipelines in parallel without
 * extra coordination. The benefit of parallel encoding is small
 * relative to the clarity of 'one file at a time, no surprises'.
 */
export async function batchExport(
  state: EditState,
  files: readonly File[],
  ctx: EditorContext,
  onProgress?: (p: BatchProgress) => void,
): Promise<BatchResult> {
  const started = performance.now();
  const { device } = await ctx.ensure();

  // Face-blur boxes are stored in the active-image's source coord space.
  // They DO NOT carry meaningful meaning for other images in the batch
  // (different dimensions, different content). Strip face-blur before
  // fanning out so no image gets incorrect masks applied.
  const templateState = produce(state, (d) => {
    d.faceBlur = null;
  });

  const results: { name: string; blob: Blob }[] = [];
  const errors: { file: string; message: string }[] = [];
  let totalBytes = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    onProgress?.({ done: i, total: files.length, currentFile: file.name });
    let bitmap: ImageBitmap | null = null;
    try {
      bitmap = await createImageBitmap(file);
      // Each image gets a fresh source; everything else is inherited.
      const perImageState = produce(templateState, (d) => {
        d.source = {
          bitmap: bitmap!,
          file,
          exif: {},
          naturalWidth: bitmap!.width,
          naturalHeight: bitmap!.height,
        };
      });
      const pipeline = stateToPipeline(
        perImageState,
        'export',
        () => Pipeline.create({ device }),
        { coordScale: 1 },
      );
      try {
        const result = await pipeline.run(bitmap);
        const ext = FORMAT_EXT[result.stats.format] ?? 'bin';
        const stem = file.name.replace(/\.[^.]+$/, '');
        results.push({
          name: `${stem}.pixflow.${ext}`,
          blob: result.blob,
        });
        totalBytes += result.blob.size;
      } finally {
        pipeline.dispose();
      }
    } catch (err) {
      errors.push({
        file: file.name,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      bitmap?.close();
    }
  }
  onProgress?.({ done: files.length, total: files.length, currentFile: '' });

  const zip = await buildZip(results);
  return {
    zip,
    count: results.length,
    totalBytes,
    durationMs: performance.now() - started,
    errors,
  };
}

/** Trigger a browser download for the ZIP blob. Filename: `pixflow-batch-<N>.zip`. */
export function downloadBatch(result: BatchResult): void {
  const url = URL.createObjectURL(result.zip);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pixflow-batch-${String(result.count)}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
