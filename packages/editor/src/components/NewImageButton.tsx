import { useCallback, useRef, type ChangeEvent } from 'react';
import { useEditStore } from '../state/store';
import { useBatchQueue } from '../state/batch-queue';
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
  const setBatchQueue = useBatchQueue((s) => s.set);
  const clearBatchQueue = useBatchQueue((s) => s.clear);
  const inputRef = useRef<HTMLInputElement>(null);

  const onClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const onChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const all = Array.from(e.target.files ?? []).filter((f) =>
        f.type.startsWith('image/'),
      );
      e.target.value = '';
      const first = all[0];
      if (!first) return;
      try {
        const bitmap = await createImageBitmap(first);
        loadImage(first, bitmap, {}, bitmap.width, bitmap.height);
        if (all.length > 1) setBatchQueue(all, 0);
        else clearBatchQueue();
      } catch {
        /* silently ignore decode failure */
      }
    },
    [loadImage, setBatchQueue, clearBatchQueue],
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
        multiple
        onChange={(e) => void onChange(e)}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />
    </>
  );
}
