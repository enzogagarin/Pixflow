import { useCallback, useState, type ChangeEvent } from 'react';
import { produce } from 'immer';
import { useEditStore } from '../../state/store';
import type { EditState } from '../../state/types';
import { useEditorContext } from '../../context/EditorContextProvider';
import { downloadExport, exportDocument, type StripReport } from '../../services/export-document';
import { InspectorSlider } from './InspectorSlider';
import { Segmented } from './Segmented';

type ExportFormat = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif';

const FORMAT_OPTIONS: readonly { value: ExportFormat; label: string }[] = [
  { value: 'image/webp', label: 'WebP' },
  { value: 'image/jpeg', label: 'JPEG' },
  { value: 'image/png', label: 'PNG' },
  { value: 'image/avif', label: 'AVIF' },
];

/**
 * Export panel. Bundles format + quality + resize-max controls plus
 * the save action itself. Lives in the Inspector accordion alongside
 * Geometry/Color/Detail/Overlay so users can dial in the output
 * without leaving the panel.
 *
 * Metadata stripping is not a user control here — it happens by
 * construction when pixflow re-encodes from a canvas readback. The
 * audit line communicates the guarantee instead of offering a toggle.
 */
export function ExportSection() {
  const document = useEditStore((s) => s.document);
  const commit = useEditStore((s) => s.commit);
  const ctx = useEditorContext();

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [lastReport, setLastReport] = useState<StripReport | null>(null);

  const setFormat = useCallback(
    (fmt: ExportFormat) => {
      const doc = useEditStore.getState().document;
      if (!doc) return;
      commit(
        produce(doc.present, (d) => {
          d.output.format = fmt;
        }),
      );
    },
    [commit],
  );

  const setQuality = useCallback(
    (v: number): EditState =>
      produce(useEditStore.getState().document!.present, (d) => {
        d.output.quality = v;
      }),
    [],
  );

  const applyResize = useCallback(
    (dim: 'maxWidth' | 'maxHeight', next: number | undefined) => {
      const doc = useEditStore.getState().document;
      if (!doc) return;
      const cur = doc.present.output.resize;
      const w = dim === 'maxWidth' ? next : cur?.maxWidth;
      const h = dim === 'maxHeight' ? next : cur?.maxHeight;
      // Build a fresh ResizeSpec without ever assigning `undefined` to an
      // optional property (exactOptionalPropertyTypes forbids that).
      let nextSpec: EditState['output']['resize'];
      if (w === undefined && h === undefined) {
        nextSpec = null;
      } else if (w !== undefined && h !== undefined) {
        nextSpec = { fit: cur?.fit ?? 'inside', maxWidth: w, maxHeight: h };
      } else if (w !== undefined) {
        nextSpec = { fit: cur?.fit ?? 'inside', maxWidth: w };
      } else {
        nextSpec = { fit: cur?.fit ?? 'inside', maxHeight: h! };
      }
      commit(
        produce(doc.present, (d) => {
          d.output.resize = nextSpec;
        }),
      );
    },
    [commit],
  );

  const onMaxWidthChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.trim();
      const next = raw === '' ? undefined : Math.max(1, Math.floor(Number(raw)));
      applyResize('maxWidth', next);
    },
    [applyResize],
  );

  const onMaxHeightChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.trim();
      const next = raw === '' ? undefined : Math.max(1, Math.floor(Number(raw)));
      applyResize('maxHeight', next);
    },
    [applyResize],
  );

  const onExport = useCallback(async () => {
    const doc = useEditStore.getState().document;
    if (!doc || busy) return;
    setBusy(true);
    setStatus('Rendering…');
    try {
      const result = await exportDocument(doc.present, ctx);
      downloadExport(result, doc.present.source.file);
      setLastReport(result.stripped);
      setStatus(
        `Saved · ${result.width}×${result.height} · ${
          (result.blob.size / 1024).toFixed(0)
        } KB · ${result.durationMs.toFixed(0)} ms`,
      );
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }, [ctx, busy]);

  if (!document) return null;
  const output = document.present.faceBlur
    ? `${document.present.faceBlur.boxes.length} face-blur ${
        document.present.faceBlur.boxes.length === 1 ? 'region' : 'regions'
      }`
    : null;
  const { format, quality, resize } = document.present.output;
  const isPng = format === 'image/png';

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-[var(--font-mono)] text-[10px] text-[var(--color-muted)]">
          Format
        </span>
        <Segmented
          value={format}
          options={FORMAT_OPTIONS}
          onChange={setFormat}
          ariaLabel="Export format"
        />
      </div>

      <div className={isPng ? 'opacity-40' : ''}>
        <InspectorSlider
          label={isPng ? 'Quality (PNG is lossless)' : 'Quality'}
          value={quality}
          min={0}
          max={1}
          step={0.01}
          resetValue={0.9}
          precision={2}
          getNextState={setQuality}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="font-[var(--font-mono)] text-[10px] text-[var(--color-muted)]">
          Max dimensions (leave blank to keep source size)
        </span>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min="1"
            placeholder="width"
            value={resize?.maxWidth ?? ''}
            onChange={onMaxWidthChange}
            className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 font-[var(--font-mono)] text-xs tabular-nums focus:border-[var(--color-accent)] focus:outline-none"
          />
          <span className="font-[var(--font-mono)] text-[10px] text-[var(--color-muted)]">×</span>
          <input
            type="number"
            min="1"
            placeholder="height"
            value={resize?.maxHeight ?? ''}
            onChange={onMaxHeightChange}
            className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 font-[var(--font-mono)] text-xs tabular-nums focus:border-[var(--color-accent)] focus:outline-none"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => void onExport()}
        disabled={busy}
        className="mt-1 rounded-md border border-[var(--color-accent)] bg-[var(--color-accent-dim)] px-3 py-2 font-[var(--font-mono)] text-xs font-semibold text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent)] hover:text-[var(--color-bg)] disabled:cursor-wait disabled:opacity-60"
      >
        {busy ? 'Exporting…' : '↓ Export'}
      </button>

      {status && (
        <p className="font-[var(--font-mono)] text-[10px] text-[var(--color-muted)]">{status}</p>
      )}

      <div className="mt-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] p-2">
        <p className="font-[var(--font-mono)] text-[10px] text-[var(--color-accent)]">
          ✓ {lastReport?.summary ??
            'All EXIF, GPS, camera-identifying tags, XMP, and embedded thumbnails are stripped on export.'}
        </p>
        {output && (
          <p className="mt-1 font-[var(--font-mono)] text-[10px] text-[var(--color-muted)]">
            Export will obscure {output}.
          </p>
        )}
      </div>
    </div>
  );
}
