import { ZOOM_MAX, ZOOM_MIN } from '../viewport/viewport-state';

interface ZoomControlsProps {
  readonly scale: number;
  readonly onZoomIn: () => void;
  readonly onZoomOut: () => void;
  readonly onFit: () => void;
  readonly onActualSize: () => void;
}

/**
 * Bottom-bar zoom UI. Disabled-state handling is deliberately verbose
 * for clarity (ZOOM_MIN / ZOOM_MAX guards). Tailwind classes follow
 * the existing PR #4 pill pattern (HistoryIndicator). PR #6 will wrap
 * the shortcuts into Radix tooltips; for now the bare buttons live
 * inside CanvasViewport's bottom row.
 */
export function ZoomControls(props: ZoomControlsProps) {
  const pct = Math.round(props.scale * 100);
  const atMin = props.scale <= ZOOM_MIN + 1e-6;
  const atMax = props.scale >= ZOOM_MAX - 1e-6;

  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-2 py-1 font-[var(--font-mono)] text-xs">
      <button
        type="button"
        onClick={props.onZoomOut}
        disabled={atMin}
        aria-label="Zoom out"
        className="px-1.5 py-0.5 hover:text-[var(--color-accent)] disabled:opacity-40"
      >
        −
      </button>
      <span className="min-w-[3rem] text-center tabular-nums">{pct}%</span>
      <button
        type="button"
        onClick={props.onZoomIn}
        disabled={atMax}
        aria-label="Zoom in"
        className="px-1.5 py-0.5 hover:text-[var(--color-accent)] disabled:opacity-40"
      >
        +
      </button>
      <span className="text-[var(--color-muted)]">·</span>
      <button
        type="button"
        onClick={props.onFit}
        aria-label="Fit to viewport"
        className="px-1.5 py-0.5 hover:text-[var(--color-accent)]"
      >
        Fit
      </button>
      <button
        type="button"
        onClick={props.onActualSize}
        aria-label="Actual size (100%)"
        className="px-1.5 py-0.5 hover:text-[var(--color-accent)]"
      >
        1:1
      </button>
    </div>
  );
}
