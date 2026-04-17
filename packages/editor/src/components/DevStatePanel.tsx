import { useEditStore } from '../state/store';
import { applyPreset } from '../state/presets';
import type { PresetName } from 'pixflow';

/**
 * Developer-facing panel for the PR #4 smoke test: displays the current
 * present state (minus the un-serializable source.bitmap) and offers
 * quick mutation buttons so the user can verify undo/redo works. Not
 * shipping in the final UI — replaced by the real inspector in PR #6.
 */
export function DevStatePanel() {
  const document = useEditStore((s) => s.document);
  const commit = useEditStore((s) => s.commit);
  const undo = useEditStore((s) => s.undo);
  const redo = useEditStore((s) => s.redo);

  if (!document) {
    return (
      <p className="font-[var(--font-mono)] text-xs text-[var(--color-muted)]">
        No document loaded. Drop an image above to begin.
      </p>
    );
  }

  const presets: readonly PresetName[] = [
    'forum-post',
    'ecommerce-thumbnail',
    'blog-hero',
    'avatar',
  ];

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {presets.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => commit(applyPreset(document.present, name))}
            className="rounded border border-[var(--color-border)] bg-[var(--color-bg-elev-2)] px-3 py-1.5 font-[var(--font-mono)] text-xs text-[var(--color-fg)] hover:border-[var(--color-accent)]"
          >
            {name}
          </button>
        ))}
        <button
          type="button"
          onClick={undo}
          className="rounded border border-[var(--color-border)] bg-[var(--color-bg-elev-2)] px-3 py-1.5 font-[var(--font-mono)] text-xs text-[var(--color-muted)] hover:border-[var(--color-accent-dim)]"
        >
          undo (⌘Z)
        </button>
        <button
          type="button"
          onClick={redo}
          className="rounded border border-[var(--color-border)] bg-[var(--color-bg-elev-2)] px-3 py-1.5 font-[var(--font-mono)] text-xs text-[var(--color-muted)] hover:border-[var(--color-accent-dim)]"
        >
          redo (⇧⌘Z)
        </button>
      </div>
      <pre className="max-h-80 overflow-auto rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elev-2)] p-3 font-[var(--font-mono)] text-[11px] leading-relaxed text-[var(--color-muted)]">
        {stringifyForDisplay(document)}
      </pre>
    </div>
  );
}

function stringifyForDisplay(document: unknown): string {
  return JSON.stringify(
    document,
    (key, value) => {
      if (key === 'bitmap') return '[ImageBitmap]';
      if (key === 'file' && value && typeof value === 'object') {
        const f = value as File;
        return `[File: ${f.name} · ${f.size.toString()}B · ${f.type}]`;
      }
      return value;
    },
    2,
  );
}
