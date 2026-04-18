import { useEffect, useState } from 'react';
import { isWebGPUSupported } from 'pixflow';
import { useT } from '../i18n/useT';
import type { MessageKey } from '../i18n/messages';

type Status =
  | { phase: 'probing' }
  | { phase: 'supported' }
  | { phase: 'unsupported' };

export function WebGPUStatus() {
  const t = useT();
  const [status, setStatus] = useState<Status>({ phase: 'probing' });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ok = await isWebGPUSupported();
      if (cancelled) return;
      setStatus({ phase: ok ? 'supported' : 'unsupported' });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const { labelKey, dotClass, textClass } = describe(status);

  return (
    <div
      role="status"
      aria-live="polite"
      title={status.phase === 'unsupported' ? t('webgpu.suggest') : undefined}
      className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-1.5 font-[var(--font-mono)] text-xs"
    >
      <span className={`h-2 w-2 rounded-full ${dotClass}`} aria-hidden="true" />
      <span className={textClass}>{t(labelKey)}</span>
      {status.phase === 'unsupported' && (
        <span className="text-[10px] text-[var(--color-muted)]">· {t('webgpu.suggest')}</span>
      )}
    </div>
  );
}

function describe(s: Status): {
  labelKey: MessageKey;
  dotClass: string;
  textClass: string;
} {
  switch (s.phase) {
    case 'probing':
      return {
        labelKey: 'webgpu.ready',
        dotClass: 'bg-[var(--color-muted)] animate-pulse',
        textClass: 'text-[var(--color-muted)]',
      };
    case 'supported':
      return {
        labelKey: 'webgpu.ready',
        dotClass: 'bg-[var(--color-accent)]',
        textClass: 'text-[var(--color-fg)]',
      };
    case 'unsupported':
      return {
        labelKey: 'webgpu.unavailable',
        dotClass: 'bg-[var(--color-danger)]',
        textClass: 'text-[var(--color-danger)]',
      };
  }
}
