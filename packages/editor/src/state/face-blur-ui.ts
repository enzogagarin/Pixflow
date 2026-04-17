import { create } from 'zustand';

/**
 * Ephemeral UI state for the face-blur panel. Lives outside the EditStore
 * because it's not document state — it's session mode ("am I currently
 * clicking to place boxes?"). Keeps the history reducer pure and avoids
 * polluting undo/redo with toolbar toggles.
 */
export interface FaceBlurUiStore {
  readonly pickMode: boolean;
  togglePickMode: () => void;
  setPickMode: (next: boolean) => void;
}

export const useFaceBlurUi = create<FaceBlurUiStore>((set) => ({
  pickMode: false,
  togglePickMode: () => set((s) => ({ pickMode: !s.pickMode })),
  setPickMode: (next) => set({ pickMode: next }),
}));
