import { useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from 'react';
import { useEditStore } from '../state/store';
import { useBatchQueue } from '../state/batch-queue';
import { useT } from '../i18n/useT';

/**
 * Minimal file input for PR #4's browser smoke test. Supports both
 * drag-and-drop and click-to-browse. Accepts the first image file,
 * decodes it to an ImageBitmap, and calls store.loadImage. Empty EXIF
 * is passed — real parsing lands in PR #11.
 *
 * Errors (non-image file, decode failure) surface in a local
 * `message` state below the drop box. No toasts / modals yet; those
 * land with Radix integration in PR #6.
 *
 * Keyboard a11y: Enter / Space on the focused drop target opens the
 * file picker, matching native <input type=file> semantics.
 */
export function DropZone() {
  const t = useT();
  const loadImage = useEditStore((s) => s.loadImage);
  const setBatchQueue = useBatchQueue((s) => s.set);
  const clearBatchQueue = useBatchQueue((s) => s.clear);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleFiles(files: FileList | null): Promise<void> {
    setMessage(null);
    const all = Array.from(files ?? []).filter((f) => f.type.startsWith('image/'));
    const first = all[0];
    if (!first) return;
    try {
      const bitmap = await createImageBitmap(first);
      loadImage(first, bitmap, {}, bitmap.width, bitmap.height);
      if (all.length > 1) {
        // Multi-drop: the first becomes the active image, the rest sit in
        // the batch queue waiting for "Export all". Drop a new single file
        // later → queue clears (handled below on single-file paths).
        setBatchQueue(all, 0);
      } else {
        clearBatchQueue();
      }
      setMessage(
        `Loaded: ${first.name} · ${bitmap.width.toString()}×${bitmap.height.toString()}${
          all.length > 1 ? ` · +${String(all.length - 1)} queued` : ''
        }`,
      );
    } catch (err) {
      setMessage(`Failed to decode ${first.name}: ${String(err)}`);
    }
  }

  function openPicker(): void {
    fileInputRef.current?.click();
  }

  function onDragOver(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    setActive(true);
  }

  function onDragLeave(): void {
    setActive(false);
  }

  function onDrop(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    setActive(false);
    void handleFiles(e.dataTransfer.files);
  }

  function onInputChange(e: ChangeEvent<HTMLInputElement>): void {
    void handleFiles(e.target.files);
    // Reset the input value so picking the same file twice in a row still
    // fires the change event — otherwise the second pick is a silent no-op.
    e.target.value = '';
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openPicker();
    }
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-2">
      <div
        role="button"
        tabIndex={0}
        onClick={openPicker}
        onKeyDown={onKeyDown}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        aria-label="Drop an image file here, or click to browse"
        className={`cursor-pointer rounded-lg border border-dashed p-8 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] ${
          active
            ? 'border-[var(--color-accent)] bg-[var(--color-accent-dim)]'
            : 'border-[var(--color-border-strong)] bg-[var(--color-bg-elev-2)] hover:border-[var(--color-accent)]'
        }`}
      >
        <p className="font-[var(--font-mono)] text-sm">{t('dropzone.primary')}</p>
        <p className="mt-1 text-[11px] text-[var(--color-muted)]">
          {t('dropzone.hint')}
        </p>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={onInputChange}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />
      {message !== null && (
        <p className="text-center font-[var(--font-mono)] text-[11px] text-[var(--color-muted)]">
          {message}
        </p>
      )}
    </div>
  );
}
