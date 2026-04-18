import { create } from 'zustand';

/**
 * Ephemeral queue of images waiting to receive the same edits as the
 * currently-active document. Does not persist across reloads —
 * session-only like everything else in the editor. Files are held as
 * File references (no bitmap decoding until they're processed), so
 * a 20-image batch doesn't pin 20 ImageBitmaps in memory.
 *
 * Semantics:
 *   - DropZone calls `set(files)` with the full drop; the first file
 *     becomes the active document (loaded separately via loadImage).
 *   - Batch export iterates the queue and processes each file with the
 *     current EditState (minus face-blur, which is inherently per-image).
 *   - `clear()` resets when the user loads a fresh single image.
 */
export interface BatchQueueStore {
  readonly files: readonly File[];
  readonly activeIndex: number;
  set: (files: readonly File[], activeIndex?: number) => void;
  setActiveIndex: (index: number) => void;
  clear: () => void;
}

export const useBatchQueue = create<BatchQueueStore>((set) => ({
  files: [],
  activeIndex: 0,
  set: (files, activeIndex = 0) => set({ files, activeIndex }),
  setActiveIndex: (index) =>
    set((s) => (index >= 0 && index < s.files.length ? { activeIndex: index } : s)),
  clear: () => set({ files: [], activeIndex: 0 }),
}));
