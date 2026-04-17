import { useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from 'react';
import { useEditStore } from '../state/store';

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
  const loadImage = useEditStore((s) => s.loadImage);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleFiles(files: FileList | null): Promise<void> {
    setMessage(null);
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setMessage(`"${file.name}" is not an image file.`);
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      loadImage(file, bitmap, {}, bitmap.width, bitmap.height);
      setMessage(
        `Loaded: ${file.name} · ${bitmap.width.toString()}×${bitmap.height.toString()}`,
      );
    } catch (err) {
      setMessage(`Failed to decode ${file.name}: ${String(err)}`);
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
        <p className="font-[var(--font-mono)] text-sm">Drop an image</p>
        <p className="mt-1 text-[11px] text-[var(--color-muted)]">
          or click to browse · everything stays in your browser
        </p>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
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
