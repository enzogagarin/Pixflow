import { useCallback, useMemo, useState, type ChangeEvent } from 'react';
import { produce } from 'immer';
import { useEditStore } from '../../state/store';
import { useT } from '../../i18n/useT';
import type { EditState } from '../../state/types';
import { useEditorContext } from '../../context/EditorContextProvider';
import { downloadExport, exportDocument, type StripReport } from '../../services/export-document';
import { InspectorSlider } from './InspectorSlider';
import { Segmented } from './Segmented';

type ExportFormat = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif';

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
  const t = useT();
  const document = useEditStore((s) => s.document);
  const formatOptions = useMemo(
    (): readonly { value: ExportFormat; label: string }[] => [
      { value: 'image/webp', label: t('export.format.webp') },
      { value: 'image/jpeg', label: t('export.format.jpeg') },
      { value: 'image/png', label: t('export.format.png') },
      { value: 'image/avif', label: t('export.format.avif') },
    ],
    [t],
  );
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
    setStatus(t('export.rendering'));
    try {
      const result = await exportDocument(doc.present, ctx);
      downloadExport(result, doc.present.source.file);
      setLastReport(result.stripped);
      setStatus(
        t('export.saved', {
          w: result.width,
          h: result.height,
          kb: (result.blob.size / 1024).toFixed(0),
          ms: result.durationMs.toFixed(0),
        }),
      );
    } catch (err) {
      setStatus(t('export.error', { message: err instanceof Error ? err.message : String(err) }));
    } finally {
      setBusy(false);
    }
  }, [ctx, busy, t]);

  if (!document) return null;
  const faceBoxCount = document.present.faceBlur?.boxes.length ?? 0;
  const { format, quality, resize } = document.present.output;
  const isPng = format === 'image/png';

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-[var(--font-mono)] text-[10px] text-[var(--color-muted)]">
          {t('export.format')}
        </span>
        <Segmented
          value={format}
          options={formatOptions}
          onChange={setFormat}
          ariaLabel={t('export.format')}
        />
      </div>

      <div className={isPng ? 'opacity-40' : ''}>
        <InspectorSlider
          label={isPng ? t('export.qualityPng') : t('export.quality')}
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
          {t('export.maxDims')}
        </span>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min="1"
            placeholder={t('export.width')}
            value={resize?.maxWidth ?? ''}
            onChange={onMaxWidthChange}
            className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 font-[var(--font-mono)] text-xs tabular-nums focus:border-[var(--color-accent)] focus:outline-none"
          />
          <span className="font-[var(--font-mono)] text-[10px] text-[var(--color-muted)]">×</span>
          <input
            type="number"
            min="1"
            placeholder={t('export.height')}
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
        {busy ? t('export.busy') : t('export.button')}
      </button>

      {status && (
        <p className="font-[var(--font-mono)] text-[10px] text-[var(--color-muted)]">{status}</p>
      )}

      <div className="mt-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] p-2">
        <p className="font-[var(--font-mono)] text-[10px] text-[var(--color-accent)]">
          {lastReport?.summary ?? t('export.stripSummary')}
        </p>
        {faceBoxCount > 0 && (
          <p className="mt-1 font-[var(--font-mono)] text-[10px] text-[var(--color-muted)]">
            {t(faceBoxCount === 1 ? 'export.obscuresFaces' : 'export.obscuresFacesPlural', { count: faceBoxCount })}
          </p>
        )}
      </div>
    </div>
  );
}
