import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { createEditorContext, type EditorContext } from './editor-context';

const Ctx = createContext<EditorContext | null>(null);

/**
 * Mounts a single EditorContext for the editor app's lifetime. Calls
 * dispose() on unmount (useful in tests; in production the only unmount
 * is page navigation, where browser cleanup also runs). React 19 strict
 * mode double-mounts effects in dev — the dispose path is idempotent
 * by design, so the second mount cleanly creates a fresh context.
 */
export function EditorContextProvider({ children }: { children: ReactNode }) {
  const ctx = useMemo(() => createEditorContext(), []);
  useEffect(() => () => ctx.dispose(), [ctx]);
  return <Ctx.Provider value={ctx}>{children}</Ctx.Provider>;
}

export function useEditorContext(): EditorContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useEditorContext must be called inside <EditorContextProvider>');
  return ctx;
}
