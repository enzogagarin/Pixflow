import type { EditState } from './types';

/**
 * Hard cap on the number of undo entries retained. Each EditState is
 * ~500 bytes (everything except `source.bitmap` which is shared by
 * reference), so 50 entries costs ~25 KB — negligible against the app
 * memory budget. The bitmap is immutable for a session, so all history
 * entries share the same reference; snapshots never copy pixel data.
 */
export const HISTORY_MAX = 50;

export interface EditHistory {
  readonly past: readonly EditState[];
  readonly present: EditState;
  readonly future: readonly EditState[];
}

export function createHistory(initial: EditState): EditHistory {
  return { past: [], present: initial, future: [] };
}

/**
 * Push the current `present` to `past`, adopt `next` as the new `present`,
 * and clear `future` (redo stack is invalidated whenever a new edit branches
 * off from the past — the Vim-style "undo tree" is intentionally not a goal
 * here). Enforces HISTORY_MAX via FIFO eviction from the head of `past`.
 */
export function commit(history: EditHistory, next: EditState): EditHistory {
  const withCurrent = [...history.past, history.present];
  const trimmed =
    withCurrent.length > HISTORY_MAX
      ? withCurrent.slice(withCurrent.length - HISTORY_MAX)
      : withCurrent;
  return { past: trimmed, present: next, future: [] };
}

/**
 * Replace the present state in-place (no history push). Used by sliders
 * during drag: setPresent on every onInput keeps the preview responsive,
 * while a single commit fires on onChange (pointer release) to record
 * one history entry for the whole drag gesture.
 */
export function setPresent(history: EditHistory, next: EditState): EditHistory {
  return { past: history.past, present: next, future: history.future };
}

/**
 * Move one step back: pop the last past entry as the new present, and
 * push the current present onto the head of future. Returns null when
 * past is empty so callers can detect "nothing to undo" as a signal
 * rather than an exception.
 */
export function undo(history: EditHistory): EditHistory | null {
  if (history.past.length === 0) return null;
  const prev = history.past[history.past.length - 1];
  if (!prev) return null;
  return {
    past: history.past.slice(0, -1),
    present: prev,
    future: [history.present, ...history.future],
  };
}

/**
 * Move one step forward: pop the head of future as the new present, and
 * append the current present to past. Returns null when future is empty.
 */
export function redo(history: EditHistory): EditHistory | null {
  if (history.future.length === 0) return null;
  const next = history.future[0];
  if (!next) return null;
  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
  };
}
