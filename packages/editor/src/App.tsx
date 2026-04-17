import { WebGPUStatus } from './components/WebGPUStatus';
import pixflowPkg from 'pixflow/package.json';

export function App() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-12">
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
        Private, client-side photo editor. Nothing uploads, ever. Feature work
        begins in PR #3 — this is the boot shell.
      </p>

      <WebGPUStatus />

      <footer className="mt-auto pt-8 font-[var(--font-mono)] text-[11px] text-[var(--color-muted)]">
        imported pixflow v{pixflowPkg.version}
      </footer>
    </main>
  );
}
