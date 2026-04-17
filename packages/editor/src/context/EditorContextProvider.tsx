import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createEditorContext, type EditorContext } from './editor-context';

const Ctx = createContext<EditorContext | null>(null);

/**
 * Mounts a single EditorContext for the editor app's lifetime.
 *
 * Why no dispose-on-unmount: React 19 StrictMode double-mounts effects
 * in dev (mount → cleanup → re-mount). Disposing on the cleanup pass
 * destroys the GPUDevice; the re-mount then reuses the same memoized
 * `ctx` (useMemo persists across the strict-mode test cycle), so its
 * `ensure()` rejects forever after with "EditorContext disposed".
 *
 * The session paradigm is "one context per page load" — when the user
 * navigates away or closes the tab, the browser tears down all GPU
 * resources automatically. There's no realistic unmount that ISN'T
 * also a page teardown, so an explicit dispose-on-unmount earns
 * nothing in production but breaks dev. The `dispose()` API stays on
 * EditorContext itself for test-driven teardown.
 */
export function EditorContextProvider({ children }: { children: ReactNode }) {
  const ctx = useMemo(() => createEditorContext(), []);
  return <Ctx.Provider value={ctx}>{children}</Ctx.Provider>;
}

export function useEditorContext(): EditorContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useEditorContext must be called inside <EditorContextProvider>');
  return ctx;
}
