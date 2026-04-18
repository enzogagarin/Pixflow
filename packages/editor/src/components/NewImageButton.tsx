import { useCallback, useRef, type ChangeEvent } from 'react';
import { useEditStore } from '../state/store';
import { useT } from '../i18n/useT';

/**
 * Header button that lets the user swap the current document for a new
 * image without reloading the page. Opens a native file picker on
 * click, decodes the chosen file into an ImageBitmap, then hands it
 * off to store.loadImage — the same code path DropZone uses on the
 * empty-state view. Picking cancel is a no-op.
 */
export function NewImageButton() {
  const t = useT();
  const loadImage = useEditStore((s) => s.loadImage);
  const inputRef = useRef<HTMLInputElement>(null);

  const onClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const onChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Reset value so picking the same filename twice in a row still fires.
      e.target.value = '';
      if (!file || !file.type.startsWith('image/')) return;
      try {
        const bitmap = await createImageBitmap(file);
        loadImage(file, bitmap, {}, bitmap.width, bitmap.height);
      } catch {
        // Silently ignore decode failures here; user can retry.
        // Full error UX lives in DropZone for the empty state.
      }
    },
    [loadImage],
  );

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        className="rounded border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-2 py-[2px] font-[var(--font-mono)] text-xs text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
      >
        {t('app.newImage')}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={(e) => void onChange(e)}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />
    </>
  );
}
