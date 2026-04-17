import { produce } from 'immer';
import { useCallback } from 'react';
import { useEditStore } from '../../state/store';
import type { EditState } from '../../state/types';
import { InspectorSlider } from './InspectorSlider';

/**
 * Color inspector. Three top-level sliders (brightness, contrast,
 * saturation) plus a White Balance subsection with two slaves
 * (temperature, tint). All five sliders share the same domain
 * [-1, 1], step 0.05, reset 0, precision 2.
 *
 * Each slider's `getNextState` is a small immer producer that writes
 * exactly one field. The store does identity-comparison short-circuit
 * in PreviewEngine, so sliders that emit the same value twice in a
 * row don't trigger redundant renders.
 */
export function ColorSection() {
  const document = useEditStore((s) => s.document);

  const setBrightness = useCallback(
    (v: number): EditState =>
      produce(useEditStore.getState().document!.present, (d) => {
        d.color.brightness = v;
      }),
    [],
  );
  const setContrast = useCallback(
    (v: number): EditState =>
      produce(useEditStore.getState().document!.present, (d) => {
        d.color.contrast = v;
      }),
    [],
  );
  const setSaturation = useCallback(
    (v: number): EditState =>
      produce(useEditStore.getState().document!.present, (d) => {
        d.color.saturation = v;
      }),
    [],
  );
  const setTemperature = useCallback(
    (v: number): EditState =>
      produce(useEditStore.getState().document!.present, (d) => {
        d.color.whiteBalance.temperature = v;
      }),
    [],
  );
  const setTint = useCallback(
    (v: number): EditState =>
      produce(useEditStore.getState().document!.present, (d) => {
        d.color.whiteBalance.tint = v;
      }),
    [],
  );

  if (!document) return null;
  const { color } = document.present;

  return (
    <div className="flex flex-col gap-4 p-3">
      <InspectorSlider
        label="Brightness"
        value={color.brightness}
        min={-1}
        max={1}
        step={0.05}
        resetValue={0}
        precision={2}
        getNextState={setBrightness}
      />
      <InspectorSlider
        label="Contrast"
        value={color.contrast}
        min={-1}
        max={1}
        step={0.05}
        resetValue={0}
        precision={2}
        getNextState={setContrast}
      />
      <InspectorSlider
        label="Saturation"
        value={color.saturation}
        min={-1}
        max={1}
        step={0.05}
        resetValue={0}
        precision={2}
        getNextState={setSaturation}
      />

      <div className="flex flex-col gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-2">
        <span className="font-[var(--font-mono)] text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
          White balance
        </span>
        <InspectorSlider
          label="Temp"
          value={color.whiteBalance.temperature}
          min={-1}
          max={1}
          step={0.05}
          resetValue={0}
          precision={2}
          getNextState={setTemperature}
        />
        <InspectorSlider
          label="Tint"
          value={color.whiteBalance.tint}
          min={-1}
          max={1}
          step={0.05}
          resetValue={0}
          precision={2}
          getNextState={setTint}
        />
      </div>
    </div>
  );
}
