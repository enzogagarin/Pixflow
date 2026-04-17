import { DevStatePanel } from './components/DevStatePanel';
import { DropZone } from './components/DropZone';
import { HistoryIndicator } from './components/HistoryIndicator';
import { WebGPUStatus } from './components/WebGPUStatus';
import { useUndoRedoShortcuts } from './hooks/useUndoRedoShortcuts';
import pixflowPkg from 'pixflow/package.json';

export function App() {
  useUndoRedoShortcuts();

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 px-6 py-12">
      <header className="flex items-center gap-3">
        <span className="font-[var(--font-mono)] text-2xl leading-none text-[var(--color-accent)]">
          ▤
        </span>
        <h1 className="font-[var(--font-mono)] text-2xl font-bold tracking-tight">
          Pixflow Editor
        </h1>
        <span className="rounded border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-2 py-[2px] font-[var(--font-mono)] text-xs text-[var(--color-muted)]">
          pre-alpha
        </span>
      </header>

      <p className="max-w-md text-center text-sm text-[var(--color-muted)]">
        Private, client-side photo editor. Nothing uploads, ever. This is the
        PR #4 smoke test: load an image, apply presets, try ⌘Z / ⇧⌘Z.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <WebGPUStatus />
        <HistoryIndicator />
      </div>

      <DropZone />
      <DevStatePanel />

      <footer className="mt-auto pt-8 font-[var(--font-mono)] text-[11px] text-[var(--color-muted)]">
        imported pixflow v{pixflowPkg.version}
      </footer>
    </main>
  );
}
