import { useEffect } from 'react';

interface ToastProps {
  readonly message: string | null;
  readonly onDismiss: () => void;
  readonly durationMs?: number;
}

/**
 * Minimal bottom-center toast. Auto-dismisses after `durationMs`
 * (default 2.5s). Clicking the toast dismisses early. The parent
 * owns the message state; this component is purely presentational +
 * timer-managed.
 */
export function Toast({ message, onDismiss, durationMs = 2500 }: ToastProps) {
  useEffect(() => {
    if (!message) return;
    const handle = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(handle);
  }, [message, durationMs, onDismiss]);

  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={onDismiss}
      className="pointer-events-auto fixed bottom-6 left-1/2 z-40 -translate-x-1/2 cursor-pointer rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-2 font-[var(--font-mono)] text-xs text-[var(--color-fg)] shadow-lg"
    >
      {message}
    </div>
  );
}
