import { useEffect } from 'react';
import { useEditStore } from '../state/store';
import { isFreshEditState } from '../state/defaults';

/**
 * Registers a `beforeunload` handler that fires the browser's native
 * "are you sure you want to leave?" prompt when the user has made
 * edits. Keyed on the document's present state — a dirty document
 * (not identical to freshState) arms the prompt; a clean one disarms
 * it. Set the `enabled` arg to false from settings or tests to opt
 * out entirely.
 *
 * The prompt message is ignored by all modern browsers for security
 * reasons (they show their own text); we set `returnValue` purely to
 * trigger the prompt.
 */
export function useUnsavedWarn(enabled = true): void {
  const document = useEditStore((s) => s.document);

  useEffect(() => {
    if (!enabled) return;
    if (!document) return;
    if (isFreshEditState(document.present)) return;

    function onBeforeUnload(e: BeforeUnloadEvent): void {
      e.preventDefault();
      // Chrome/Firefox require returnValue to be set; the actual string
      // is ignored in favor of the browser's own localized message.
      e.returnValue = '';
    }

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [enabled, document]);
}
