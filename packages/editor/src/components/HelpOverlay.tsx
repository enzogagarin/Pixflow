import { useCallback, useEffect, useState } from 'react';
import { useT } from '../i18n/useT';
import type { MessageKey } from '../i18n/messages';

const HELP_DISMISSED_KEY = 'pixflow.editor.helpDismissed.v1';

/**
 * Overlay listing keyboard shortcuts and panel purposes. Trigger points:
 *   - `?` key anywhere (except when typing in an input/textarea)
 *   - Automatic first-visit display (gated on localStorage flag)
 *   - Header "?" button is deferred until we have a good place for it;
 *     keyboard-only is enough for MVP discoverability.
 *
 * Dismiss: Esc key, backdrop click, or explicit Close button. Dismissal
 * writes a localStorage flag so the auto-show doesn't re-trigger on
 * subsequent loads — after the first open the overlay is purely opt-in.
 */

const SHORTCUT_ROWS: readonly {
  readonly keys: readonly string[];
  readonly labelKey: MessageKey;
}[] = [
  { keys: ['⌘', 'Z'], labelKey: 'help.kbd.undo' },
  { keys: ['⇧', '⌘', 'Z'], labelKey: 'help.kbd.redo' },
  { keys: ['Space'], labelKey: 'help.kbd.pan' },
  { keys: ['/'], labelKey: 'help.kbd.compare' },
  { keys: ['+', '−'], labelKey: 'help.kbd.zoom' },
  { keys: ['2×', '🖱'], labelKey: 'help.kbd.sliderReset' },
  { keys: ['Esc'], labelKey: 'help.kbd.pickExit' },
  { keys: ['?'], labelKey: 'help.kbd.help' },
];

const PANEL_ROWS: readonly {
  readonly titleKey: MessageKey;
  readonly bodyKey: MessageKey;
}[] = [
  { titleKey: 'inspector.section.geometry', bodyKey: 'help.panel.geometry' },
  { titleKey: 'inspector.section.color', bodyKey: 'help.panel.color' },
  { titleKey: 'inspector.section.detail', bodyKey: 'help.panel.detail' },
  { titleKey: 'inspector.section.overlay', bodyKey: 'help.panel.overlay' },
  { titleKey: 'inspector.section.export', bodyKey: 'help.panel.export' },
];

export function HelpOverlay() {
  const t = useT();
  const [open, setOpen] = useState(false);

  // First-visit auto-show.
  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(HELP_DISMISSED_KEY);
      if (!dismissed) setOpen(true);
    } catch {
      /* localStorage blocked — skip auto-show */
    }
  }, []);

  // Keyboard: `?` opens, `Esc` closes. Ignore when the user is typing in
  // an input/textarea/contenteditable so we don't fight with form entry.
  useEffect(() => {
    function isTyping(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === '?' && !isTyping(e.target)) {
        e.preventDefault();
        setOpen(true);
        return;
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const dismiss = useCallback(() => {
    setOpen(false);
    try {
      localStorage.setItem(HELP_DISMISSED_KEY, '1');
    } catch {
      /* ignore */
    }
  }, []);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('help.title')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div className="relative max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-5 shadow-xl">
        <header className="flex items-center justify-between">
          <h2 className="font-[var(--font-mono)] text-base font-semibold tracking-tight">
            {t('help.title')}
          </h2>
          <button
            type="button"
            onClick={dismiss}
            aria-label={t('help.dismiss')}
            className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-0.5 font-[var(--font-mono)] text-[10px] text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            {t('help.dismiss')}
          </button>
        </header>

        <section className="mt-4">
          <h3 className="mb-2 font-[var(--font-mono)] text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
            {t('help.shortcuts.title')}
          </h3>
          <ul className="flex flex-col gap-1.5 font-[var(--font-mono)] text-xs">
            {SHORTCUT_ROWS.map((row) => (
              <li key={row.labelKey} className="flex items-center justify-between gap-3">
                <span className="text-[var(--color-muted)]">{t(row.labelKey)}</span>
                <div className="flex gap-1">
                  {row.keys.map((k, i) => (
                    <kbd
                      key={`${row.labelKey}-${String(i)}`}
                      className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5 text-[10px] text-[var(--color-fg)]"
                    >
                      {k}
                    </kbd>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-5">
          <h3 className="mb-2 font-[var(--font-mono)] text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
            {t('help.panel.title')}
          </h3>
          <dl className="flex flex-col gap-2 font-[var(--font-mono)] text-xs">
            {PANEL_ROWS.map((row) => (
              <div key={row.titleKey} className="flex flex-col gap-0.5">
                <dt className="text-[var(--color-accent)]">{t(row.titleKey)}</dt>
                <dd className="text-[var(--color-muted)]">{t(row.bodyKey)}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}
