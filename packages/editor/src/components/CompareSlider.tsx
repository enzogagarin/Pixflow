import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react';

interface CompareSliderProps {
  /** Current split position, 0 (all original) to 100 (all edited). */
  readonly value: number;
  readonly onChange: (next: number) => void;
}

/**
 * Vertical drag handle for the before/after compare overlay. The line
 * itself spans the container; the handle in the middle is a draggable
 * pill. Pointer events are captured so dragging outside the container
 * still updates the position. The visual is rendered absolutely inside
 * the canvas viewport — its parent must be `position: relative`.
 */
export function CompareSlider({ value, onChange }: CompareSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);
      const parent = target.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      function update(clientX: number): void {
        const pct = ((clientX - rect.left) / rect.width) * 100;
        onChange(Math.max(0, Math.min(100, pct)));
      }
      update(e.clientX);
      function onMove(ev: PointerEvent): void {
        update(ev.clientX);
      }
      function onUp(ev: PointerEvent): void {
        target.releasePointerCapture(ev.pointerId);
        target.removeEventListener('pointermove', onMove);
        target.removeEventListener('pointerup', onUp);
      }
      target.addEventListener('pointermove', onMove);
      target.addEventListener('pointerup', onUp);
    },
    [onChange],
  );

  return (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      role="slider"
      aria-label="Before/after compare"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
      style={{ left: `${value.toString()}%` }}
      className="absolute top-0 bottom-0 z-10 -ml-px w-0.5 cursor-ew-resize bg-[var(--color-accent)]"
    >
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--color-accent)] bg-[var(--color-bg)] px-2 py-1 font-[var(--font-mono)] text-[10px] text-[var(--color-accent)] shadow-sm">
        ⇆
      </div>
    </div>
  );
}
