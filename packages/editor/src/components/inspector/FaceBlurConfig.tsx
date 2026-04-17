import { useCallback, useState } from 'react';
import { produce } from 'immer';
import { useEditStore } from '../../state/store';
import { useFaceBlurUi } from '../../state/face-blur-ui';
import type { EditState, FaceBlurState } from '../../state/types';
import { faceDetectService, type LoadingPhase } from '../../services/face-detect';
import { InspectorSlider } from './InspectorSlider';
import { Segmented } from './Segmented';

const PHASE_LABELS: Record<LoadingPhase, string> = {
  'fetching-runtime': 'Loading runtime…',
  'fetching-model': 'Fetching model…',
  'verifying-model': 'Verifying integrity…',
  'creating-session': 'Initializing…',
  ready: 'Detecting…',
};

function labelFor(phase: LoadingPhase): string {
  return PHASE_LABELS[phase] ?? phase;
}

const DEFAULT_FACE_BLUR: FaceBlurState = {
  boxes: [],
  style: 'pixelate',
  strength: 0.7,
};

const STYLE_OPTIONS = [
  { value: 'pixelate' as const, label: 'Pixel' },
  { value: 'gaussian' as const, label: 'Blur' },
];

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
  const document = useEditStore((s) => s.document);
  const commit = useEditStore((s) => s.commit);
  const pickMode = useFaceBlurUi((s) => s.pickMode);
  const setPickMode = useFaceBlurUi((s) => s.setPickMode);

  const faceBlur = document?.present.faceBlur ?? null;

  const [detecting, setDetecting] = useState(false);
  const [detectStatus, setDetectStatus] = useState<string | null>(null);

  const onAutoDetect = useCallback(async () => {
    const doc = useEditStore.getState().document;
    if (!doc || detecting) return;
    setDetecting(true);
    setDetectStatus(labelFor('fetching-runtime'));
    try {
      const bitmap = doc.present.source.bitmap;
      const detected = await faceDetectService.detect(bitmap, {
        onProgress: (phase) => setDetectStatus(labelFor(phase)),
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
          ? 'No faces detected.'
          : `Detected ${String(detected.length)} face${detected.length === 1 ? '' : 's'}.`,
      );
    } catch (err) {
      setDetectStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDetecting(false);
    }
  }, [detecting, commit]);

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
        <span className="font-[var(--font-mono)] text-xs">Face blur</span>
        <label className="flex cursor-pointer items-center gap-1.5 font-[var(--font-mono)] text-[10px] text-[var(--color-muted)]">
          <input
            type="checkbox"
            checked={enabled}
            onChange={onToggleEnabled}
            className="size-3 cursor-pointer accent-[var(--color-accent)]"
          />
          Enable
        </label>
      </div>

      {!enabled && (
        <p className="font-[var(--font-mono)] text-[10px] text-[var(--color-muted)]">
          Mask faces or sensitive areas with pixelation or gaussian blur.
        </p>
      )}

      {enabled && faceBlur && (
        <>
          <div className="flex items-center justify-between gap-2">
            <span className="font-[var(--font-mono)] text-[10px] text-[var(--color-muted)]">
              Style
            </span>
            <Segmented
              value={faceBlur.style}
              options={STYLE_OPTIONS}
              onChange={onStyleChange}
              ariaLabel="Face blur style"
            />
          </div>

          <InspectorSlider
            label="Strength"
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
              {pickMode ? 'Picking…' : '+ Add box'}
            </button>
            <button
              type="button"
              onClick={() => void onAutoDetect()}
              disabled={detecting}
              className="rounded border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-2 py-1 font-[var(--font-mono)] text-[10px] text-[var(--color-fg)] transition-colors hover:border-[var(--color-accent)] disabled:cursor-wait disabled:opacity-60"
            >
              {detecting ? 'Detecting…' : '⚙ Auto-detect'}
            </button>
            {boxes.length > 0 && (
              <button
                type="button"
                onClick={onClearBoxes}
                className="ml-auto font-[var(--font-mono)] text-[10px] text-[var(--color-muted)] underline-offset-2 hover:text-[var(--color-fg)] hover:underline"
              >
                Clear all
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
              No regions yet. Click "Add box" then click on the image to
              place one.
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
                    aria-label={`Remove region ${String(i + 1)}`}
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
              ⚠ {String(boxes.length)} region
              {boxes.length === 1 ? '' : 's'} will be obscured on export.
            </p>
          )}
        </>
      )}
    </div>
  );
}
