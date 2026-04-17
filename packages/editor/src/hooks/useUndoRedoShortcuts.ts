import { useEffect } from 'react';
import { useEditStore } from '../state/store';

/**
 * Window-level keyboard shortcuts for undo/redo. Intentionally
 * ignores events fired from text-entry contexts so typing in an
 * <input>/<textarea>/[contenteditable] doesn't hijack Cmd+Z.
 *
 *   Cmd/Ctrl+Z           → undo
 *   Cmd/Ctrl+Shift+Z     → redo
 *
 * We deliberately do NOT support the Windows-y "Ctrl+Y = redo" variant
 * because the editor targets a cross-platform audience and consistent
 * shortcuts feel better than matching every OS's native idiom.
 *
 * `useEditStore.getState()` is used instead of the reactive hook because
 * this effect shouldn't re-subscribe on every store change; it only reads
 * the actions, which are stable references.
 */
export function useUndoRedoShortcuts(): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (isTypingTarget(e.target)) return;
      const modifier = e.metaKey || e.ctrlKey;
      if (!modifier) return;
      const key = e.key.toLowerCase();
      if (key !== 'z') return;
      e.preventDefault();
      if (e.shiftKey) {
        useEditStore.getState().redo();
      } else {
        useEditStore.getState().undo();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
  if (target.isContentEditable) return true;
  return false;
}
