import { useBatchQueue } from '../state/batch-queue';
import { useT } from '../i18n/useT';

/**
 * Header pill showing the total-queued count. Only rendered when the
 * queue has more than one file (the active file plus at least one more
 * pending). Batch export lives in the Export inspector section — this
 * is just the quick visual "you dropped N, not 1" cue so users don't
 * think the extra files were ignored.
 */
export function BatchIndicator() {
  const t = useT();
  const count = useBatchQueue((s) => s.files.length);
  if (count < 2) return null;
  return (
    <span
      title={t(count === 1 ? 'batch.queued' : 'batch.queuedPlural', { count })}
      className="rounded border border-[var(--color-accent)] bg-[var(--color-accent-dim)] px-2 py-[2px] font-[var(--font-mono)] text-xs text-[var(--color-accent)]"
    >
      {t(count === 1 ? 'batch.queued' : 'batch.queuedPlural', { count })}
    </span>
  );
}
