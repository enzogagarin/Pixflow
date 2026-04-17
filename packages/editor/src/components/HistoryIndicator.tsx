import { useEditStore } from '../state/store';

/**
 * Compact pill showing `← N   M →` where N is the undo-depth (past size)
 * and M is the redo-depth (future size). When either count is zero, that
 * half dims to indicate the shortcut won't do anything.
 *
 * Subscribes only to the two counts (via separate selectors) so it
 * re-renders on commit/undo/redo but NOT on setPresent (which leaves
 * past/future length unchanged).
 */
export function HistoryIndicator() {
  const pastLen = useEditStore((s) => s.document?.past.length ?? 0);
  const futureLen = useEditStore((s) => s.document?.future.length ?? 0);

  return (
    <div
      role="status"
      aria-label="Edit history"
      className="inline-flex items-center gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-1.5 font-[var(--font-mono)] text-xs"
    >
      <span
        className={
          pastLen > 0
            ? 'text-[var(--color-fg)]'
            : 'text-[var(--color-muted)] opacity-50'
        }
      >
        ← {pastLen}
      </span>
      <span className="text-[var(--color-muted)]">·</span>
      <span
        className={
          futureLen > 0
            ? 'text-[var(--color-fg)]'
            : 'text-[var(--color-muted)] opacity-50'
        }
      >
        {futureLen} →
      </span>
    </div>
  );
}
