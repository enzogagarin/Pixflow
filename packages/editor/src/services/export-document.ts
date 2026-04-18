import { Pipeline } from 'pixflow';
import { stateToPipeline } from '../render/state-to-pipeline';
import type { EditState } from '../state/types';
import type { EditorContext } from '../context/editor-context';

export interface ExportResult {
  readonly blob: Blob;
  readonly width: number;
  readonly height: number;
  readonly format: string;
  readonly durationMs: number;
  readonly stripped: StripReport;
}

/**
 * Summary of what the export pipeline removed relative to the source.
 * Pixflow decodes the source bitmap into a GPU texture and re-encodes
 * via the browser's canvas-backed codec — this path fundamentally
 * cannot carry EXIF, XMP, ICC profiles, or PNG ancillary chunks
 * through, so the export blob is "metadata-free" by construction.
 *
 * For MVP we surface that guarantee as a static report. A future
 * audit PR can diff parsed source metadata against the export to
 * produce a per-field list.
 */
export interface StripReport {
  /** Human-readable one-liner suitable for the export UI audit line. */
  readonly summary: string;
  /** Categories guaranteed absent from the exported blob. */
  readonly guaranteed: readonly string[];
}

const DEFAULT_STRIP_REPORT: StripReport = {
  summary:
    'All EXIF, GPS, camera-identifying tags, XMP, and embedded thumbnails stripped from export.',
  guaranteed: [
    'EXIF (camera, lens, timestamp, GPS)',
    'EXIF embedded thumbnail',
    'XMP (Adobe, editing history)',
    'PNG text chunks (tEXt/iTXt/zTXt)',
    'ICC color profile',
  ],
};

/**
 * Run a full-resolution export: build the pipeline at export mode,
 * render against the source bitmap (coordScale = 1), return the
 * resulting blob alongside a strip report for UI display.
 *
 * Does NOT trigger a download — the caller decides whether to save,
 * share, or preview. Separation of "make the bytes" from "hand them
 * to the user" keeps this callable from a future batch-mode export
 * loop without assuming a single-image UX.
 */
export async function exportDocument(
  state: EditState,
  ctx: EditorContext,
): Promise<ExportResult> {
  const started = performance.now();
  const { device } = await ctx.ensure();

  const pipeline = stateToPipeline(
    state,
    'export',
    () => Pipeline.create({ device }),
    { coordScale: 1 },
  );
  try {
    const result = await pipeline.run(state.source.bitmap);
    return {
      blob: result.blob,
      width: result.width,
      height: result.height,
      format: result.stats.format,
      durationMs: performance.now() - started,
      stripped: DEFAULT_STRIP_REPORT,
    };
  } finally {
    pipeline.dispose();
  }
}

const FORMAT_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

/**
 * Kick off a browser download for an export result. Derives a filename
 * from the original source file (keeping the stem, swapping the
 * extension, appending `.pixflow` so exports are distinguishable from
 * originals in the user's Downloads folder).
 */
export function downloadExport(result: ExportResult, sourceFile: File): void {
  const stem = sourceFile.name.replace(/\.[^.]+$/, '');
  const ext = FORMAT_EXT[result.format] ?? 'bin';
  const name = `${stem}.pixflow.${ext}`;
  const url = URL.createObjectURL(result.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before revoking.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
