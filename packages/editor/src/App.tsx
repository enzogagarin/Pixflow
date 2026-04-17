import { CanvasViewport } from './components/CanvasViewport';
import { DevStatePanel } from './components/DevStatePanel';
import { DropZone } from './components/DropZone';
import { HistoryIndicator } from './components/HistoryIndicator';
import { Inspector } from './components/inspector/Inspector';
import { WebGPUStatus } from './components/WebGPUStatus';
import { EditorContextProvider } from './context/EditorContextProvider';
import { useUndoRedoShortcuts } from './hooks/useUndoRedoShortcuts';
import { useEditStore } from './state/store';
import pixflowPkg from 'pixflow/package.json';

export function App() {
  return (
    <EditorContextProvider>
      <AppShell />
    </EditorContextProvider>
  );
}

function AppShell() {
  useUndoRedoShortcuts();
  const document = useEditStore((s) => s.document);

  return (
    <main className="flex min-h-screen flex-col gap-4 px-6 py-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-[var(--font-mono)] text-2xl leading-none text-[var(--color-accent)]">
            ▤
          </span>
          <h1 className="font-[var(--font-mono)] text-xl font-bold tracking-tight">
            Pixflow Editor
          </h1>
          <span className="rounded border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-2 py-[2px] font-[var(--font-mono)] text-xs text-[var(--color-muted)]">
            pre-alpha · PR #6
          </span>
        </div>
        <div className="flex items-center gap-3">
          <WebGPUStatus />
          <HistoryIndicator />
        </div>
      </header>

      {document ? (
        <div className="flex flex-1 gap-4">
          <div className="flex flex-1 flex-col gap-4">
            <CanvasViewport />
            <DevStatePanel />
          </div>
          <Inspector />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <DropZone />
        </div>
      )}

      <footer className="flex items-center justify-between font-[var(--font-mono)] text-[11px] text-[var(--color-muted)]">
        <span>imported pixflow v{pixflowPkg.version}</span>
        <span>Drop image · ⌘Z undo · ⇧⌘Z redo · Space pan · / compare · +/− zoom · 2× click slider = reset</span>
      </footer>
    </main>
  );
}
