import { useCallback, useRef } from 'react';
import { useEditStore } from '../state/store';
import type { EditState } from '../state/types';

interface UseSliderDragArgs {
  /**
   * Pure function: given a slider value, return the next EditState.
   * Typically built with immer's `produce` over `getState().present`.
   * Called for every drag emit, so it must be cheap.
   */
  readonly getNextState: (value: number) => EditState;
}

interface UseSliderDragResult {
  /** Wire to Radix Slider's `onValueChange` (continuous, drag emits). */
  readonly onValueChange: (value: number) => void;
  /** Wire to Radix Slider's `onValueCommit` (pointer release). */
  readonly onValueCommit: (value: number) => void;
  /** Imperative reset — used by double-click → set to default value. */
  readonly reset: (defaultValue: number) => void;
}

/**
 * Implements the slider-drag discipline from spec Section 3:
 * - Every drag emit (`onValueChange`) calls `setPresent` so the
 *   PreviewEngine re-renders, but does NOT push history (live preview).
 * - On pointer release (`onValueCommit`), a single `commit({ baseline })`
 *   pushes ONE history entry for the whole gesture, with `baseline`
 *   being the pre-drag state captured on the first emit.
 * - `reset` is a one-shot commit that turns into a normal history entry
 *   (no baseline gymnastics — double-click reset is its own gesture).
 */
export function useSliderDrag(args: UseSliderDragArgs): UseSliderDragResult {
  const baselineRef = useRef<EditState | null>(null);

  const onValueChange = useCallback(
    (value: number) => {
      const store = useEditStore.getState();
      if (!store.document) return;
      // Capture the baseline on the FIRST emit of a gesture. Subsequent
      // emits preserve the baseline so onValueCommit can pass it through.
      if (baselineRef.current === null) {
        baselineRef.current = store.document.present;
      }
      const next = args.getNextState(value);
      store.setPresent(next);
    },
    [args],
  );

  const onValueCommit = useCallback(
    (value: number) => {
      const store = useEditStore.getState();
      if (!store.document) return;
      const baseline = baselineRef.current;
      // Reset the baseline immediately so a subsequent gesture captures
      // fresh state, regardless of whether the commit goes through.
      baselineRef.current = null;
      const next = args.getNextState(value);
      if (baseline) {
        store.commit(next, { baseline });
      } else {
        // No prior onValueChange (e.g. user clicked the slider track
        // without dragging) — just commit normally; current present
        // becomes the past entry.
        store.commit(next);
      }
    },
    [args],
  );

  const reset = useCallback(
    (defaultValue: number) => {
      const store = useEditStore.getState();
      if (!store.document) return;
      // Drop any in-flight baseline; reset is its own discrete action.
      baselineRef.current = null;
      const next = args.getNextState(defaultValue);
      store.commit(next);
    },
    [args],
  );

  return { onValueChange, onValueCommit, reset };
}
