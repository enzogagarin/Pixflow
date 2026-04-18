import { useCallback, useMemo, useState } from 'react';
import { produce } from 'immer';
import { useEditStore } from '../../state/store';
import { useFaceBlurUi } from '../../state/face-blur-ui';
import { useT } from '../../i18n/useT';
import type { MessageKey } from '../../i18n/messages';
import type { EditState, FaceBlurState } from '../../state/types';
import { faceDetectService, type LoadingPhase } from '../../services/face-detect';
import { InspectorSlider } from './InspectorSlider';
import { Segmented } from './Segmented';

const PHASE_KEY: Record<LoadingPhase, MessageKey> = {
  'fetching-runtime': 'faceBlur.phase.fetchingRuntime',
  'fetching-model': 'faceBlur.phase.fetchingModel',
  'verifying-model': 'faceBlur.phase.verifyingModel',
  'creating-session': 'faceBlur.phase.creatingSession',
  ready: 'faceBlur.phase.ready',
};

const DEFAULT_FACE_BLUR: FaceBlurState = {
  boxes: [],
  style: 'pixelate',
  strength: 0.7,
};

/**
 * Face-blur panel. Manual box picking for PR #10a; BlazeFace auto-detect
 * arrives in PR #10b. UX flow:
 *   - Toggle "Enable" → commits `faceBlur: { boxes: [], style, strength }`.
 *   - Toggle again → commits `faceBlur: null` (removes filter entirely).
 *   - "Add box" button → enters pickMode; user clicks on the canvas to
 *     place boxes. Click again to exit pickMode (or press Esc in viewport).
 *   - Each placed box appears in a list with a Remove button.
 *   - Style + Strength are shared across all boxes (single filter call).
 */
export function FaceBlurConfig() {
  const t = useT();
  const document = useEditStore((s) => s.document);
  const commit = useEditStore((s) => s.commit);
  const pickMode = useFaceBlurUi((s) => s.pickMode);
  const setPickMode = useFaceBlurUi((s) => s.setPickMode);

  const faceBlur = document?.present.faceBlur ?? null;

  const [detecting, setDetecting] = useState(false);
  const [detectStatus, setDetectStatus] = useState<string | null>(null);

  const styleOptions = useMemo(
    () => [
      { value: 'pixelate' as const, label: t('faceBlur.style.pixelate') },
      { value: 'gaussian' as const, label: t('faceBlur.style.gaussian') },
    ],
    [t],
  );

  const onAutoDetect = useCallback(async () => {
    const doc = useEditStore.getState().document;
    if (!doc || detecting) return;
    setDetecting(true);
    setDetectStatus(t(PHASE_KEY['fetching-runtime']));
    try {
      const bitmap = doc.present.source.bitmap;
      const detected = await faceDetectService.detect(bitmap, {
        onProgress: (phase) => setDetectStatus(t(PHASE_KEY[phase])),
        minConfidence: 0.7,
      });
      const current = useEditStore.getState().document;
      if (!current) return;
      const existing = current.present.faceBlur ?? DEFAULT_FACE_BLUR;
      commit(
        produce(current.present, (d) => {
          d.faceBlur = {
            ...existing,
            boxes: [...existing.boxes, ...detected],
          };
        }),
      );
      setDetectStatus(
        detected.length === 0
          ? t('faceBlur.noFaces')
          : t(
              detected.length === 1 ? 'faceBlur.detected' : 'faceBlur.detectedPlural',
              { count: detected.length },
            ),
      );
    } catch (err) {
      setDetectStatus(
        t('export.error', { message: err instanceof Error ? err.message : String(err) }),
      );
    } finally {
      setDetecting(false);
    }
  }, [detecting, commit, t]);

  const onToggleEnabled = useCallback(() => {
    const doc = useEditStore.getState().document;
    if (!doc) return;
    if (doc.present.faceBlur) {
      commit(
        produce(doc.present, (d) => {
          d.faceBlur = null;
        }),
      );
      setPickMode(false);
    } else {
      commit(
        produce(doc.present, (d) => {
          d.faceBlur = { ...DEFAULT_FACE_BLUR, boxes: [] };
        }),
      );
    }
  }, [commit, setPickMode]);

  const onStyleChange = useCallback(
    (style: 'pixelate' | 'gaussian') => {
      const doc = useEditStore.getState().document;
      if (!doc || !doc.present.faceBlur) return;
      commit(
        produce(doc.present, (d) => {
          if (d.faceBlur) d.faceBlur.style = style;
        }),
      );
    },
    [commit],
  );

  const onRemoveBox = useCallback(
    (index: number) => {
      const doc = useEditStore.getState().document;
      if (!doc || !doc.present.faceBlur) return;
      commit(
        produce(doc.present, (d) => {
          if (d.faceBlur) {
            d.faceBlur.boxes = d.faceBlur.boxes.filter((_, i) => i !== index);
          }
        }),
      );
    },
    [commit],
  );

  const onClearBoxes = useCallback(() => {
    const doc = useEditStore.getState().document;
    if (!doc || !doc.present.faceBlur) return;
    commit(
      produce(doc.present, (d) => {
        if (d.faceBlur) d.faceBlur.boxes = [];
      }),
    );
  }, [commit]);

  const getStrengthState = useCallback(
    (value: number): EditState =>
      produce(useEditStore.getState().document!.present, (d) => {
        if (d.faceBlur) d.faceBlur.strength = value;
      }),
    [],
  );

  if (!document) return null;

  const enabled = faceBlur !== null;
  const boxes = faceBlur?.boxes ?? [];

  return (
    <div className="flex flex-col gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-2">
      <div className="flex items-center justify-between">
        <span className="font-[var(--font-mono)] text-xs">{t('faceBlur.title')}</span>
        <label className="flex cursor-pointer items-center gap-1.5 font-[var(--font-mono)] text-[10px] text-[var(--color-muted)]">
          <input
            type="checkbox"
            checked={enabled}
            onChange={onToggleEnabled}
            className="size-3 cursor-pointer accent-[var(--color-accent)]"
          />
          {t('faceBlur.enable')}
        </label>
      </div>

      {!enabled && (
        <p className="font-[var(--font-mono)] text-[10px] text-[var(--color-muted)]">
          {t('faceBlur.description')}
        </p>
      )}

      {enabled && faceBlur && (
        <>
          <div className="flex items-center justify-between gap-2">
            <span className="font-[var(--font-mono)] text-[10px] text-[var(--color-muted)]">
              {t('faceBlur.style')}
            </span>
            <Segmented
              value={faceBlur.style}
              options={styleOptions}
              onChange={onStyleChange}
              ariaLabel={t('faceBlur.style')}
            />
          </div>

          <InspectorSlider
            label={t('faceBlur.strength')}
            value={faceBlur.strength}
            min={0}
            max={1}
            step={0.01}
            resetValue={0.7}
            precision={2}
            getNextState={getStrengthState}
          />

          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => setPickMode(!pickMode)}
              className={`rounded border px-2 py-1 font-[var(--font-mono)] text-[10px] transition-colors ${
                pickMode
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-dim)] text-[var(--color-accent)]'
                  : 'border-[var(--color-border)] bg-[var(--color-bg-elev)] text-[var(--color-fg)] hover:border-[var(--color-accent)]'
              }`}
            >
              {pickMode ? t('faceBlur.picking') : t('faceBlur.addBox')}
            </button>
            <button
              type="button"
              onClick={() => void onAutoDetect()}
              disabled={detecting}
              className="rounded border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-2 py-1 font-[var(--font-mono)] text-[10px] text-[var(--color-fg)] transition-colors hover:border-[var(--color-accent)] disabled:cursor-wait disabled:opacity-60"
            >
              {detecting ? t('faceBlur.detecting') : t('faceBlur.autoDetect')}
            </button>
            {boxes.length > 0 && (
              <button
                type="button"
                onClick={onClearBoxes}
                className="ml-auto font-[var(--font-mono)] text-[10px] text-[var(--color-muted)] underline-offset-2 hover:text-[var(--color-fg)] hover:underline"
              >
                {t('faceBlur.clearAll')}
              </button>
            )}
          </div>

          {detectStatus && (
            <p className="font-[var(--font-mono)] text-[10px] text-[var(--color-muted)]">
              {detectStatus}
            </p>
          )}

          {boxes.length === 0 ? (
            <p className="font-[var(--font-mono)] text-[10px] text-[var(--color-muted)]">
              {t('faceBlur.noRegions')}
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {boxes.map((b, i) => (
                <li
                  key={`${String(b.x)}-${String(b.y)}-${String(i)}`}
                  className="flex items-center justify-between gap-1 rounded bg-[var(--color-bg-elev)] px-1.5 py-1 font-[var(--font-mono)] text-[10px]"
                >
                  <span className="text-[var(--color-muted)]">
                    #{String(i + 1)}
                  </span>
                  <span className="flex-1 text-center tabular-nums">
                    {Math.round(b.x)}, {Math.round(b.y)} · {Math.round(b.w)}×{Math.round(b.h)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemoveBox(i)}
                    aria-label={t('faceBlur.remove', { index: i + 1 })}
                    className="rounded px-1 text-[var(--color-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-fg)]"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          {boxes.length > 0 && (
            <p className="font-[var(--font-mono)] text-[10px] text-[var(--color-accent)]">
              {t(boxes.length === 1 ? 'faceBlur.warning' : 'faceBlur.warningPlural', { count: boxes.length })}
            </p>
          )}
        </>
      )}
    </div>
  );
}
