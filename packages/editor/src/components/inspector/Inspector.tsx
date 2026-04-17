import * as Accordion from '@radix-ui/react-accordion';
import { useCallback } from 'react';
import { useEditStore } from '../../state/store';
import { useInspectorPrefs } from '../../hooks/useInspectorPrefs';
import type { SectionId } from '../../state/inspector-prefs';
import { GeometrySection } from './GeometrySection';
import { ColorSection } from './ColorSection';

/**
 * Right-rail inspector. Renders nothing until a document is loaded
 * (the empty-state view is the DropZone). Sections are independent
 * accordion panels; the open/closed state is persisted via
 * useInspectorPrefs and survives page reloads.
 */
export function Inspector() {
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

  if (!document) return null;

  return (
    <aside className="flex w-[320px] shrink-0 flex-col overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)]">
      <header className="border-b border-[var(--color-border)] px-3 py-2 font-[var(--font-mono)] text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
        Inspector
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
              <span>Geometry</span>
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
              <span>Color</span>
              <span aria-hidden="true" className="data-[state=open]:rotate-90">▸</span>
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content>
            <ColorSection />
          </Accordion.Content>
        </Accordion.Item>
      </Accordion.Root>
    </aside>
  );
}
