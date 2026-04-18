import { useEffect } from 'react';
import { useEditStore } from '../state/store';

/**
 * Global listener for Cmd+V / Ctrl+V image paste. Triggers when the
 * paste clipboard has any `image/*` MIME type. Ignored when the paste
 * target is an `<input>`, `<textarea>`, or contentEditable region so
 * pasting text into form fields still works normally.
 *
 * On success: decodes the blob to an ImageBitmap and loads it as a
 * new document via `store.loadImage` — same path DropZone uses.
 * `onToast` fires on success + failure for optional UI feedback.
 */
export function useClipboardPaste(onToast?: (kind: 'pasted' | 'notImage') => void): void {
  const loadImage = useEditStore((s) => s.loadImage);

  useEffect(() => {
    function isTyping(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
    }

    async function onPaste(e: ClipboardEvent): Promise<void> {
      if (isTyping(e.target)) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (!file) continue;
          try {
            e.preventDefault();
            const bitmap = await createImageBitmap(file);
            loadImage(file, bitmap, {}, bitmap.width, bitmap.height);
            onToast?.('pasted');
          } catch {
            onToast?.('notImage');
          }
          return;
        }
      }
      // No image item found — only toast if the user's paste target
      // was clearly the editor canvas (not a sneaky mis-fire on body).
      // For MVP we skip the empty-paste toast to avoid noise.
    }

    const handler = (e: ClipboardEvent): void => {
      void onPaste(e);
    };
    window.addEventListener('paste', handler);
    return () => window.removeEventListener('paste', handler);
  }, [loadImage, onToast]);
}
