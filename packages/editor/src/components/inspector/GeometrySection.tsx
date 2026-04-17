import { produce } from 'immer';
import { useCallback } from 'react';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { useEditStore } from '../../state/store';
import { Segmented } from './Segmented';

const ROTATE_OPTIONS = [
  { value: '0', label: '0°' },
  { value: '90', label: '90°' },
  { value: '180', label: '180°' },
  { value: '270', label: '270°' },
] as const;

/**
 * Geometry inspector. Maps 1:1 to state.geometry:
 *   - Rotate: segmented control (0/90/180/270 degrees)
 *   - Flip: two toggle buttons (horizontal + vertical)
 *   - Crop: stub button (interactive crop tool lands in PR #7)
 *
 * All edits use single-shot commits (no drag discipline — these are
 * discrete clicks, not continuous gestures).
 */
export function GeometrySection() {
  const document = useEditStore((s) => s.document);

  const onRotateChange = useCallback((next: string) => {
    const store = useEditStore.getState();
    if (!store.document) return;
    const deg = Number(next) as 0 | 90 | 180 | 270;
    store.commit(
      produce(store.document.present, (d) => {
        d.geometry.rotate = deg;
      }),
    );
  }, []);

  const onFlipChange = useCallback((axes: string[]) => {
    const store = useEditStore.getState();
    if (!store.document) return;
    store.commit(
      produce(store.document.present, (d) => {
        d.geometry.flip = {
          h: axes.includes('h'),
          v: axes.includes('v'),
        };
      }),
    );
  }, []);

  if (!document) return null;
  const { geometry } = document.present;
  const flipValue: string[] = [];
  if (geometry.flip.h) flipValue.push('h');
  if (geometry.flip.v) flipValue.push('v');

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <span className="font-[var(--font-mono)] text-xs text-[var(--color-muted)]">
          Rotate
        </span>
        <Segmented
          value={String(geometry.rotate)}
          options={ROTATE_OPTIONS}
          onChange={onRotateChange}
          ariaLabel="Rotation in degrees"
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="font-[var(--font-mono)] text-xs text-[var(--color-muted)]">
          Flip
        </span>
        <ToggleGroup.Root
          type="multiple"
          value={flipValue}
          onValueChange={onFlipChange}
          aria-label="Flip axes"
          className="inline-flex overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] font-[var(--font-mono)] text-xs"
        >
          <ToggleGroup.Item
            value="h"
            aria-label="Flip horizontal"
            className="px-2.5 py-1 text-[var(--color-muted)] hover:text-[var(--color-fg)] data-[state=on]:bg-[var(--color-accent-dim)] data-[state=on]:text-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          >
            ⇆
          </ToggleGroup.Item>
          <ToggleGroup.Item
            value="v"
            aria-label="Flip vertical"
            className="px-2.5 py-1 text-[var(--color-muted)] hover:text-[var(--color-fg)] data-[state=on]:bg-[var(--color-accent-dim)] data-[state=on]:text-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          >
            ⇅
          </ToggleGroup.Item>
        </ToggleGroup.Root>
      </div>

      <div className="flex items-center justify-between">
        <span className="font-[var(--font-mono)] text-xs text-[var(--color-muted)]">
          Crop
        </span>
        <button
          type="button"
          disabled
          title="Crop tool ships in PR #7"
          className="cursor-not-allowed rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1 font-[var(--font-mono)] text-xs text-[var(--color-muted)] opacity-50"
        >
          Enter crop tool
        </button>
      </div>
    </div>
  );
}
