import { create } from 'zustand';
import type { EditState, ExifTable } from './types';
import {
  createHistory,
  commit as historyCommit,
  setPresent as historySetPresent,
  undo as historyUndo,
  redo as historyRedo,
  type EditHistory,
} from './history';
import { freshState } from './defaults';

export interface CommitOptions {
  /**
   * State to push onto the `past` stack instead of the current `present`.
   * Used by slider drags: the caller tracks the pre-drag baseline and
   * passes it here on pointer-release so the history entry represents
   * the gesture's before/after, not the fine-grained mid-drag jitter.
   */
  readonly baseline?: EditState;
}

export interface EditorStore {
  readonly document: EditHistory | null;
  loadImage: (
    file: File,
    bitmap: ImageBitmap,
    exif: ExifTable,
    naturalWidth: number,
    naturalHeight: number,
  ) => void;
  setPresent: (next: EditState) => void;
  commit: (next: EditState, options?: CommitOptions) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
}

/**
 * Central editor store. zustand v5 with plain functional updates — the
 * history reducer already produces new immutable objects per action, so
 * immer middleware doesn't earn its weight here. PR #6 (inspector
 * sliders) will layer immer in for draft-mutation ergonomics when
 * components need to write `draft.present.color.brightness = x`.
 *
 * `document` is null until the first image is loaded. All mutation
 * actions are silent no-ops when document is null — they return early
 * without throwing so UI handlers (keyboard shortcuts, buttons) don't
 * need to guard each call site.
 */
export const useEditStore = create<EditorStore>((set) => ({
  document: null,

  loadImage: (file, bitmap, exif, naturalWidth, naturalHeight) => {
    set({
      document: createHistory(
        freshState(file, bitmap, exif, naturalWidth, naturalHeight),
      ),
    });
  },

  setPresent: (next) => {
    set((state) =>
      state.document
        ? { document: historySetPresent(state.document, next) }
        : state,
    );
  },

  commit: (next, options) => {
    set((state) => {
      if (!state.document) return state;
      // If a baseline is provided, swap it into present before committing
      // so past = [..., baseline] and present = next. This is how slider
      // drags record a single history entry for the whole gesture.
      if (options?.baseline) {
        const withBaseline: EditHistory = {
          past: state.document.past,
          present: options.baseline,
          future: [],
        };
        return { document: historyCommit(withBaseline, next) };
      }
      return { document: historyCommit(state.document, next) };
    });
  },

  undo: () => {
    set((state) => {
      if (!state.document) return state;
      const result = historyUndo(state.document);
      return result ? { document: result } : state;
    });
  },

  redo: () => {
    set((state) => {
      if (!state.document) return state;
      const result = historyRedo(state.document);
      return result ? { document: result } : state;
    });
  },

  clear: () => set({ document: null }),
}));
