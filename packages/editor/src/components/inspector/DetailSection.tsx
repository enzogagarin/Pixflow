import { produce } from 'immer';
import { useCallback } from 'react';
import { useEditStore } from '../../state/store';
import type { EditState } from '../../state/types';
import { InspectorSlider } from './InspectorSlider';

const DEFAULT_SHARPEN = { amount: 0.3, radius: 1 };
const DEFAULT_BLUR = { sigma: 2 };

/**
 * Detail inspector. Two independent subsections, each with an enable
 * checkbox that toggles the EditState slot between `null` and a
 * default-shaped object. While enabled, sliders edit the active fields.
 *
 *   ☐ Sharpen
 *       Amount  [─────●─────] 0.30
 *       Radius  [──●────────] 1.0
 *   ☐ Blur
 *       Sigma   [──●────────] 2.0
 *
 * Defaults match the spec mockup (Section 4): sharpen amount 0.3 +
 * radius 1.0, blur sigma 2.0. Reset values match defaults so
 * double-click on a slider returns to the on-enable initial value
 * rather than zero (zero would visually disable the filter and feel
 * inconsistent with the still-checked enable box).
 */
export function DetailSection() {
  const document = useEditStore((s) => s.document);

  const toggleSharpen = useCallback((enabled: boolean) => {
    const store = useEditStore.getState();
    if (!store.document) return;
    store.commit(
      produce(store.document.present, (d) => {
        d.detail.sharpen = enabled ? { ...DEFAULT_SHARPEN } : null;
      }),
    );
  }, []);

  const toggleBlur = useCallback((enabled: boolean) => {
    const store = useEditStore.getState();
    if (!store.document) return;
    store.commit(
      produce(store.document.present, (d) => {
        d.detail.blur = enabled ? { ...DEFAULT_BLUR } : null;
      }),
    );
  }, []);

  const setSharpenAmount = useCallback(
    (v: number): EditState =>
      produce(useEditStore.getState().document!.present, (d) => {
        if (d.detail.sharpen) d.detail.sharpen.amount = v;
      }),
    [],
  );
  const setSharpenRadius = useCallback(
    (v: number): EditState =>
      produce(useEditStore.getState().document!.present, (d) => {
        if (d.detail.sharpen) d.detail.sharpen.radius = v;
      }),
    [],
  );
  const setBlurSigma = useCallback(
    (v: number): EditState =>
      produce(useEditStore.getState().document!.present, (d) => {
        if (d.detail.blur) d.detail.blur.sigma = v;
      }),
    [],
  );

  if (!document) return null;
  const { sharpen, blur } = document.present.detail;

  return (
    <div className="flex flex-col gap-4 p-3">
      <div className="flex flex-col gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-2">
        <label className="flex items-center gap-2 font-[var(--font-mono)] text-xs">
          <input
            type="checkbox"
            checked={sharpen !== null}
            onChange={(e) => toggleSharpen(e.target.checked)}
            className="accent-[var(--color-accent)]"
          />
          <span>Sharpen</span>
        </label>
        {sharpen && (
          <div className="flex flex-col gap-3 pl-1">
            <InspectorSlider
              label="Amount"
              value={sharpen.amount}
              min={0}
              max={2}
              step={0.05}
              resetValue={DEFAULT_SHARPEN.amount}
              precision={2}
              getNextState={setSharpenAmount}
            />
            <InspectorSlider
              label="Radius"
              value={sharpen.radius}
              min={0.5}
              max={3}
              step={0.1}
              resetValue={DEFAULT_SHARPEN.radius}
              precision={1}
              getNextState={setSharpenRadius}
            />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-2">
        <label className="flex items-center gap-2 font-[var(--font-mono)] text-xs">
          <input
            type="checkbox"
            checked={blur !== null}
            onChange={(e) => toggleBlur(e.target.checked)}
            className="accent-[var(--color-accent)]"
          />
          <span>Blur</span>
        </label>
        {blur && (
          <div className="flex flex-col gap-3 pl-1">
            <InspectorSlider
              label="Sigma"
              value={blur.sigma}
              min={0.5}
              max={20}
              step={0.5}
              resetValue={DEFAULT_BLUR.sigma}
              precision={1}
              getNextState={setBlurSigma}
            />
          </div>
        )}
      </div>
    </div>
  );
}
