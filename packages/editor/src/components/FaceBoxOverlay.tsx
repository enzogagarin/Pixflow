import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { produce } from 'immer';
import { useEditStore } from '../state/store';
import { useFaceBlurUi } from '../state/face-blur-ui';
import type { FaceBox } from '../state/types';

/**
 * Drag distance (in source-bitmap pixels) below which a pointer gesture
 * is treated as a "quick click" and drops a fixed 15% square instead of
 * an exact-size rectangle. Anything beyond this threshold creates a box
 * matching the dragged area.
 */
const CLICK_DRAG_THRESHOLD_PX = 8;

interface FaceBoxOverlayProps {
  /** Preview-bitmap pixel size — matches the transform wrapper it lives in. */
  readonly previewWidth: number;
  readonly previewHeight: number;
}

/**
 * Overlay layer that (a) renders the currently-picked face-blur regions as
 * translucent rectangles on top of the edited canvas, and (b) intercepts
 * pointer clicks when `pickMode` is active and drops a new region centered
 * on the click.
 *
 * Coordinates: all stored boxes are in source-bitmap (original) pixel
 * space; rendering maps through `source.natural{Width,Height}` ratios
 * down to preview-bitmap pixels. Click events come in at preview-bitmap
 * pixels directly (the overlay sits inside the transform wrapper, so
 * getBoundingClientRect gives us preview-space coords after subtracting
 * the transform offsets — but since the overlay is scaled along with the
 * canvases by the parent transform, React/DOM give us preview-pixel
 * coordinates automatically when we read offsetX/offsetY-relative event
 * coords against the overlay's own bounding rect).
 */
interface DragState {
  /** Anchor point in source-bitmap pixels. */
  readonly startX: number;
  readonly startY: number;
  /** Current pointer in source-bitmap pixels. */
  currentX: number;
  currentY: number;
  readonly pointerId: number;
}

export function FaceBoxOverlay({ previewWidth, previewHeight }: FaceBoxOverlayProps) {
  const document = useEditStore((s) => s.document);
  const commit = useEditStore((s) => s.commit);
  const pickMode = useFaceBlurUi((s) => s.pickMode);
  const setPickMode = useFaceBlurUi((s) => s.setPickMode);

  const source = document?.present.source ?? null;
  const faceBlur = document?.present.faceBlur ?? null;

  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;

  // Esc exits pickMode.
  useEffect(() => {
    if (!pickMode) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setPickMode(false);
        setDrag(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pickMode, setPickMode]);

  const pointerToSource = useCallback(
    (el: HTMLElement, clientX: number, clientY: number): { x: number; y: number } | null => {
      if (!source) return null;
      const rect = el.getBoundingClientRect();
      const nx = (clientX - rect.left) / rect.width;
      const ny = (clientY - rect.top) / rect.height;
      return {
        x: Math.round(nx * source.naturalWidth),
        y: Math.round(ny * source.naturalHeight),
      };
    },
    [source],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!pickMode || !source || !faceBlur) return;
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      const pt = pointerToSource(e.currentTarget, e.clientX, e.clientY);
      if (!pt) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({
        startX: pt.x,
        startY: pt.y,
        currentX: pt.x,
        currentY: pt.y,
        pointerId: e.pointerId,
      });
    },
    [pickMode, source, faceBlur, pointerToSource],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const current = dragRef.current;
      if (!current || e.pointerId !== current.pointerId) return;
      const pt = pointerToSource(e.currentTarget, e.clientX, e.clientY);
      if (!pt) return;
      setDrag({ ...current, currentX: pt.x, currentY: pt.y });
    },
    [pointerToSource],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const current = dragRef.current;
      if (!current || e.pointerId !== current.pointerId || !source) {
        setDrag(null);
        return;
      }
      e.currentTarget.releasePointerCapture(e.pointerId);

      const dx = current.currentX - current.startX;
      const dy = current.currentY - current.startY;
      const dist = Math.hypot(dx, dy);

      let box: FaceBox;
      if (dist < CLICK_DRAG_THRESHOLD_PX) {
        // Quick click → fixed 15% square centered on the pointer.
        const side = Math.round(Math.min(source.naturalWidth, source.naturalHeight) * 0.15);
        const x = clamp(current.startX - Math.round(side / 2), 0, source.naturalWidth - side);
        const y = clamp(current.startY - Math.round(side / 2), 0, source.naturalHeight - side);
        box = { x, y, w: side, h: side, confidence: 1 };
      } else {
        // Drag → exact rectangle from pointerdown to pointerup.
        const x0 = Math.min(current.startX, current.currentX);
        const y0 = Math.min(current.startY, current.currentY);
        const x1 = Math.max(current.startX, current.currentX);
        const y1 = Math.max(current.startY, current.currentY);
        const x = clamp(x0, 0, source.naturalWidth - 1);
        const y = clamp(y0, 0, source.naturalHeight - 1);
        const w = Math.max(2, Math.min(source.naturalWidth - x, x1 - x0));
        const h = Math.max(2, Math.min(source.naturalHeight - y, y1 - y0));
        box = { x, y, w, h, confidence: 1 };
      }

      const doc = useEditStore.getState().document;
      if (doc?.present.faceBlur) {
        commit(
          produce(doc.present, (d) => {
            if (d.faceBlur) d.faceBlur.boxes = [...d.faceBlur.boxes, box];
          }),
        );
      }
      setDrag(null);
    },
    [source, commit],
  );

  if (!source || !faceBlur) return null;

  const boxes = faceBlur.boxes;
  const sx = previewWidth / source.naturalWidth;
  const sy = previewHeight / source.naturalHeight;

  // Live preview rect while dragging, in preview-pixel coords.
  let dragRect: { left: number; top: number; width: number; height: number } | null = null;
  if (drag && source) {
    const x0 = Math.min(drag.startX, drag.currentX);
    const y0 = Math.min(drag.startY, drag.currentY);
    const x1 = Math.max(drag.startX, drag.currentX);
    const y1 = Math.max(drag.startY, drag.currentY);
    dragRect = {
      left: x0 * sx,
      top: y0 * sy,
      width: Math.max(1, (x1 - x0) * sx),
      height: Math.max(1, (y1 - y0) * sy),
    };
  }

  return (
    <div
      className="absolute inset-0 z-10"
      style={{
        pointerEvents: pickMode ? 'auto' : 'none',
        cursor: pickMode ? 'crosshair' : 'default',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {pickMode &&
        boxes.map((b, i) => (
          <div
            key={`${String(b.x)}-${String(b.y)}-${String(i)}`}
            className="absolute border-2 border-[var(--color-accent)] bg-[var(--color-accent)]/10"
            style={{
              left: `${String(b.x * sx)}px`,
              top: `${String(b.y * sy)}px`,
              width: `${String(b.w * sx)}px`,
              height: `${String(b.h * sy)}px`,
              pointerEvents: 'none',
            }}
            aria-label={`Face blur region ${String(i + 1)}`}
          />
        ))}
      {dragRect && (
        <div
          className="absolute border-2 border-dashed border-[var(--color-accent)] bg-[var(--color-accent)]/20"
          style={{
            left: `${String(dragRect.left)}px`,
            top: `${String(dragRect.top)}px`,
            width: `${String(dragRect.width)}px`,
            height: `${String(dragRect.height)}px`,
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
