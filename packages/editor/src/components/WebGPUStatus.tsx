import { useEffect, useState } from 'react';
import { isWebGPUSupported } from 'pixflow';

type Status =
  | { phase: 'probing' }
  | { phase: 'supported' }
  | { phase: 'unsupported' };

export function WebGPUStatus() {
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

  const { label, dotClass, textClass } = describe(status);

  return (
    <div
      role="status"
      aria-live="polite"
      className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-1.5 font-[var(--font-mono)] text-xs"
    >
      <span className={`h-2 w-2 rounded-full ${dotClass}`} aria-hidden="true" />
      <span className={textClass}>{label}</span>
    </div>
  );
}

function describe(s: Status): { label: string; dotClass: string; textClass: string } {
  switch (s.phase) {
    case 'probing':
      return {
        label: 'Detecting WebGPU…',
        dotClass: 'bg-[var(--color-muted)]',
        textClass: 'text-[var(--color-muted)]',
      };
    case 'supported':
      return {
        label: 'WebGPU ready',
        dotClass: 'bg-[var(--color-accent)]',
        textClass: 'text-[var(--color-fg)]',
      };
    case 'unsupported':
      return {
        label: 'WebGPU unavailable',
        dotClass: 'bg-[var(--color-danger)]',
        textClass: 'text-[var(--color-danger)]',
      };
  }
}
