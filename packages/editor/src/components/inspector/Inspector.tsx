import * as Accordion from '@radix-ui/react-accordion';
import { useCallback } from 'react';
import { useEditStore } from '../../state/store';
import { useInspectorPrefs } from '../../hooks/useInspectorPrefs';
import type { SectionId } from '../../state/inspector-prefs';
import { freshState, isFreshEditState } from '../../state/defaults';
import { useT } from '../../i18n/useT';
import { GeometrySection } from './GeometrySection';
import { ColorSection } from './ColorSection';
import { DetailSection } from './DetailSection';
import { OverlaySection } from './OverlaySection';
import { ExportSection } from './ExportSection';

/**
 * Right-rail inspector. Renders nothing until a document is loaded
 * (the empty-state view is the DropZone). Sections are independent
 * accordion panels; the open/closed state is persisted via
 * useInspectorPrefs and survives page reloads.
 */
export function Inspector() {
  const t = useT();
  const document = useEditStore((s) => s.document);
  const { prefs, toggleSection } = useInspectorPrefs();

  const onValueChange = useCallback(
    (next: string[]) => {
      // Diff against current prefs to find the toggled section, then
      // delegate. This keeps the localStorage write path single-source.
      const cur = new Set<string>(prefs.openSections);
      const nx = new Set<string>(next);
      const added = [...nx].find((s) => !cur.has(s));
      const removed = [...cur].find((s) => !nx.has(s));
      const toggled = added ?? removed;
      if (toggled) toggleSection(toggled as SectionId);
    },
    [prefs.openSections, toggleSection],
  );

  const onReset = useCallback(() => {
    const store = useEditStore.getState();
    if (!store.document) return;
    const { source } = store.document.present;
    store.commit(
      freshState(source.file, source.bitmap, source.exif, source.naturalWidth, source.naturalHeight),
    );
  }, []);

  if (!document) return null;
  const canReset = !isFreshEditState(document.present);

  return (
    <aside className="flex w-[320px] shrink-0 flex-col overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)]">
      <header className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2 font-[var(--font-mono)] text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
        <span>{t('inspector.title')}</span>
        <button
          type="button"
          onClick={onReset}
          disabled={!canReset}
          aria-label={t('inspector.reset')}
          title={canReset ? t('inspector.resetTooltip') : t('inspector.nothingToReset')}
          className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-[var(--color-border)] disabled:hover:text-[var(--color-muted)]"
        >
          {t('inspector.reset')}
        </button>
      </header>
      <Accordion.Root
        type="multiple"
        value={[...prefs.openSections]}
        onValueChange={onValueChange}
        className="flex flex-col"
      >
        <Accordion.Item value="geometry" className="border-b border-[var(--color-border)]">
          <Accordion.Header>
            <Accordion.Trigger className="flex w-full items-center justify-between px-3 py-2 font-[var(--font-mono)] text-xs hover:bg-[var(--color-bg)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] data-[state=open]:text-[var(--color-accent)]">
              <span>{t('inspector.section.geometry')}</span>
              <span aria-hidden="true" className="data-[state=open]:rotate-90">▸</span>
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content>
            <GeometrySection />
          </Accordion.Content>
        </Accordion.Item>

        <Accordion.Item value="color">
          <Accordion.Header>
            <Accordion.Trigger className="flex w-full items-center justify-between px-3 py-2 font-[var(--font-mono)] text-xs hover:bg-[var(--color-bg)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] data-[state=open]:text-[var(--color-accent)]">
              <span>{t('inspector.section.color')}</span>
              <span aria-hidden="true" className="data-[state=open]:rotate-90">▸</span>
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content>
            <ColorSection />
          </Accordion.Content>
        </Accordion.Item>

        <Accordion.Item value="detail" className="border-t border-[var(--color-border)]">
          <Accordion.Header>
            <Accordion.Trigger className="flex w-full items-center justify-between px-3 py-2 font-[var(--font-mono)] text-xs hover:bg-[var(--color-bg)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] data-[state=open]:text-[var(--color-accent)]">
              <span>{t('inspector.section.detail')}</span>
              <span aria-hidden="true" className="data-[state=open]:rotate-90">▸</span>
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content>
            <DetailSection />
          </Accordion.Content>
        </Accordion.Item>

        <Accordion.Item value="overlay" className="border-t border-[var(--color-border)]">
          <Accordion.Header>
            <Accordion.Trigger className="flex w-full items-center justify-between px-3 py-2 font-[var(--font-mono)] text-xs hover:bg-[var(--color-bg)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] data-[state=open]:text-[var(--color-accent)]">
              <span>{t('inspector.section.overlay')}</span>
              <span aria-hidden="true" className="data-[state=open]:rotate-90">▸</span>
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content>
            <OverlaySection />
          </Accordion.Content>
        </Accordion.Item>

        <Accordion.Item value="export" className="border-t border-[var(--color-border)]">
          <Accordion.Header>
            <Accordion.Trigger className="flex w-full items-center justify-between px-3 py-2 font-[var(--font-mono)] text-xs hover:bg-[var(--color-bg)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] data-[state=open]:text-[var(--color-accent)]">
              <span>{t('inspector.section.export')}</span>
              <span aria-hidden="true" className="data-[state=open]:rotate-90">▸</span>
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content>
            <ExportSection />
          </Accordion.Content>
        </Accordion.Item>
      </Accordion.Root>
    </aside>
  );
}
