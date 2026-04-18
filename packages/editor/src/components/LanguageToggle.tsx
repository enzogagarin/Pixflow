import { useI18nStore } from '../i18n/store';
import { LOCALES } from '../i18n/messages';

/**
 * Small pill in the header that cycles through supported locales.
 * Click toggles; current locale is shown in uppercase (TR / EN).
 * localStorage-backed so the choice survives reloads.
 */
export function LanguageToggle() {
  const locale = useI18nStore((s) => s.locale);
  const setLocale = useI18nStore((s) => s.setLocale);

  const onClick = (): void => {
    const idx = LOCALES.indexOf(locale);
    const next = LOCALES[(idx + 1) % LOCALES.length] ?? LOCALES[0]!;
    setLocale(next);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Switch language (current: ${locale.toUpperCase()})`}
      className="rounded border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-2 py-[2px] font-[var(--font-mono)] text-xs uppercase tracking-wider text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
    >
      {locale}
    </button>
  );
}
