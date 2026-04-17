import * as Slider from '@radix-ui/react-slider';
import { useCallback, type ChangeEvent } from 'react';
import { useSliderDrag } from '../../hooks/useSliderDrag';
import type { EditState } from '../../state/types';

interface InspectorSliderProps {
  readonly label: string;
  /** Current value read from EditState (controlled). */
  readonly value: number;
  /** Slider domain. */
  readonly min: number;
  readonly max: number;
  /** Step for keyboard arrow-key + drag snapping. */
  readonly step: number;
  /** Value snapped to on double-click reset. */
  readonly resetValue: number;
  /** Decimal places to show in the numeric input. */
  readonly precision: number;
  /**
   * Pure function: given a candidate slider value, return the next
   * EditState. Forwarded to useSliderDrag.
   */
  readonly getNextState: (value: number) => EditState;
}

/**
 * One row of the Color inspector. Layout:
 *
 *   [Label …………………………………………… numeric]
 *   [────────────●────────────────────]
 *
 * Behavior:
 * - Drag the thumb: live preview via setPresent, ONE history entry on release.
 * - Click the track: jumps + commits as a one-shot (no drag = no baseline).
 * - Double-click anywhere on the row: reset to `resetValue`.
 * - Type into the numeric input: setPresent on every keystroke, commit on blur.
 *   Same useSliderDrag instance keeps both inputs in lockstep.
 */
export function InspectorSlider(props: InspectorSliderProps) {
  const { onValueChange, onValueCommit, reset } = useSliderDrag({
    getNextState: props.getNextState,
  });

  const onSliderChange = useCallback(
    (next: number[]) => {
      const v = next[0];
      if (v !== undefined) onValueChange(v);
    },
    [onValueChange],
  );

  const onSliderCommit = useCallback(
    (next: number[]) => {
      const v = next[0];
      if (v !== undefined) onValueCommit(v);
    },
    [onValueCommit],
  );

  const onNumericChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const v = Number(e.target.value);
      if (Number.isFinite(v) && v >= props.min && v <= props.max) {
        onValueChange(v);
      }
    },
    [onValueChange, props.min, props.max],
  );

  const onNumericBlur = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const v = Number(e.target.value);
      if (Number.isFinite(v) && v >= props.min && v <= props.max) {
        onValueCommit(v);
      }
    },
    [onValueCommit, props.min, props.max],
  );

  const onDoubleClick = useCallback(() => {
    reset(props.resetValue);
  }, [reset, props.resetValue]);

  return (
    <div
      className="flex flex-col gap-1"
      onDoubleClick={onDoubleClick}
      title={`Double-click to reset to ${props.resetValue.toString()}`}
    >
      <div className="flex items-center justify-between font-[var(--font-mono)] text-xs">
        <label className="text-[var(--color-muted)]">{props.label}</label>
        <input
          type="number"
          value={props.value.toFixed(props.precision)}
          min={props.min}
          max={props.max}
          step={props.step}
          onChange={onNumericChange}
          onBlur={onNumericBlur}
          className="w-16 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1 py-0.5 text-right tabular-nums focus:border-[var(--color-accent)] focus:outline-none"
        />
      </div>
      <Slider.Root
        className="relative flex h-5 items-center"
        value={[props.value]}
        min={props.min}
        max={props.max}
        step={props.step}
        onValueChange={onSliderChange}
        onValueCommit={onSliderCommit}
      >
        <Slider.Track className="relative h-1 flex-1 rounded-full bg-[var(--color-border)]">
          <Slider.Range className="absolute h-full rounded-full bg-[var(--color-accent-dim)]" />
        </Slider.Track>
        <Slider.Thumb
          aria-label={props.label}
          className="block h-4 w-4 rounded-full border border-[var(--color-accent)] bg-[var(--color-bg)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        />
      </Slider.Root>
    </div>
  );
}
