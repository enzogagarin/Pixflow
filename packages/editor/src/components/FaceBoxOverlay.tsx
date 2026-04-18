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
 * Drag distance (in source-bitmap pixels) below which a new-box create
 * gesture is treated as a "quick click" and drops a fixed 15% square
 * instead of an exact-size rectangle. Anything beyond this threshold
 * creates a box matching the dragged area.
 */
const CLICK_DRAG_THRESHOLD_PX = 8;

/** Hit-test inflation for corner handles (source-bitmap pixels). */
const HANDLE_HIT_SIZE = 16;

/** Minimum face-box side after a resize (source-bitmap pixels). */
const MIN_BOX_SIDE = 8;

type Corner = 'nw' | 'ne' | 'sw' | 'se';

interface FaceBoxOverlayProps {
  /** Preview-bitmap pixel size — matches the transform wrapper it lives in. */
  readonly previewWidth: number;
  readonly previewHeight: number;
}

/**
 * Overlay layer that (a) renders the currently-picked face-blur regions as
 * translucent rectangles on top of the edited canvas, (b) intercepts
 * pointer gestures when `pickMode` is active.
 *
 * Three gesture modes inferred at pointerdown:
 *   - **resize**: if the pointer starts on a corner handle of an existing
 *     box, drag moves that corner while the opposite corner stays pinned.
 *   - **move**: if the pointer starts inside an existing box (but not on
 *     a handle), drag translates the whole box.
 *   - **create**: if the pointer starts on empty overlay area, drag
 *     sweeps out a new box. Quick click (<8 px drift) drops a fixed
 *     15%-of-min-side square centered on the click.
 *
 * Coordinates: all stored FaceBoxes are in source-bitmap (original) pixel
 * space. `pointerToSource` normalizes client coords by the overlay's
 * getBoundingClientRect — which scales with zoom/pan — so the math is
 * zoom-invariant. One history entry per gesture.
 */
type Drag =
  | CreateDrag
  | MoveDrag
  | ResizeDrag;

interface CreateDrag {
  readonly kind: 'create';
  readonly startX: number;
  readonly startY: number;
  currentX: number;
  currentY: number;
  readonly pointerId: number;
}
interface MoveDrag {
  readonly kind: 'move';
  readonly targetIndex: number;
  /** Offset from the box's top-left to the initial pointer position, in source coords. */
  readonly offsetX: number;
  readonly offsetY: number;
  /** Current top-left of the box while dragging. */
  nextX: number;
  nextY: number;
  readonly w: number;
  readonly h: number;
  readonly pointerId: number;
}
interface ResizeDrag {
  readonly kind: 'resize';
  readonly targetIndex: number;
  /** Anchor: the corner that stays fixed. */
  readonly anchorX: number;
  readonly anchorY: number;
  /** Current opposite-corner position driven by the pointer. */
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

  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
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

  /**
   * Hit-test an existing box at source-space point. Returns either a
   * handle hit (with the corner name), a body hit, or null if the point
   * is outside every box. Walks boxes in reverse so later-drawn boxes
   * (topmost) win on overlap.
   */
  function hitTest(
    boxes: readonly FaceBox[],
    px: number,
    py: number,
  ): { index: number; box: FaceBox; corner: Corner | null } | null {
    for (let i = boxes.length - 1; i >= 0; i--) {
      const b = boxes[i]!;
      // Corner handles first (they extend past the box edge).
      const corners: readonly { name: Corner; cx: number; cy: number }[] = [
        { name: 'nw', cx: b.x, cy: b.y },
        { name: 'ne', cx: b.x + b.w, cy: b.y },
        { name: 'sw', cx: b.x, cy: b.y + b.h },
        { name: 'se', cx: b.x + b.w, cy: b.y + b.h },
      ];
      for (const c of corners) {
        if (
          Math.abs(px - c.cx) <= HANDLE_HIT_SIZE &&
          Math.abs(py - c.cy) <= HANDLE_HIT_SIZE
        ) {
          return { index: i, box: b, corner: c.name };
        }
      }
      // Body hit.
      if (px >= b.x && py >= b.y && px < b.x + b.w && py < b.y + b.h) {
        return { index: i, box: b, corner: null };
      }
    }
    return null;
  }

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!pickMode || !source || !faceBlur) return;
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      const pt = pointerToSource(e.currentTarget, e.clientX, e.clientY);
      if (!pt) return;
      e.currentTarget.setPointerCapture(e.pointerId);

      const hit = hitTest(faceBlur.boxes, pt.x, pt.y);
      if (hit?.corner) {
        // Resize: pin opposite corner.
        const ax = hit.corner === 'nw' || hit.corner === 'sw' ? hit.box.x + hit.box.w : hit.box.x;
        const ay = hit.corner === 'nw' || hit.corner === 'ne' ? hit.box.y + hit.box.h : hit.box.y;
        setDrag({
          kind: 'resize',
          targetIndex: hit.index,
          anchorX: ax,
          anchorY: ay,
          currentX: pt.x,
          currentY: pt.y,
          pointerId: e.pointerId,
        });
        return;
      }
      if (hit) {
        // Move: remember pointer-to-box offset.
        setDrag({
          kind: 'move',
          targetIndex: hit.index,
          offsetX: pt.x - hit.box.x,
          offsetY: pt.y - hit.box.y,
          nextX: hit.box.x,
          nextY: hit.box.y,
          w: hit.box.w,
          h: hit.box.h,
          pointerId: e.pointerId,
        });
        return;
      }
      // Create.
      setDrag({
        kind: 'create',
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
      if (!current || e.pointerId !== current.pointerId || !source) return;
      const pt = pointerToSource(e.currentTarget, e.clientX, e.clientY);
      if (!pt) return;
      if (current.kind === 'create') {
        setDrag({ ...current, currentX: pt.x, currentY: pt.y });
      } else if (current.kind === 'resize') {
        setDrag({ ...current, currentX: pt.x, currentY: pt.y });
      } else {
        // Move: clamp so the box can't leave the image.
        const nx = clamp(pt.x - current.offsetX, 0, source.naturalWidth - current.w);
        const ny = clamp(pt.y - current.offsetY, 0, source.naturalHeight - current.h);
        setDrag({ ...current, nextX: nx, nextY: ny });
      }
    },
    [pointerToSource, source],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const current = dragRef.current;
      if (!current || e.pointerId !== current.pointerId || !source) {
        setDrag(null);
        return;
      }
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* pointer already released */
      }

      if (current.kind === 'create') {
        const dx = current.currentX - current.startX;
        const dy = current.currentY - current.startY;
        const dist = Math.hypot(dx, dy);
        let box: FaceBox;
        if (dist < CLICK_DRAG_THRESHOLD_PX) {
          const side = Math.round(Math.min(source.naturalWidth, source.naturalHeight) * 0.15);
          const x = clamp(current.startX - Math.round(side / 2), 0, source.naturalWidth - side);
          const y = clamp(current.startY - Math.round(side / 2), 0, source.naturalHeight - side);
          box = { x, y, w: side, h: side, confidence: 1 };
        } else {
          const x0 = Math.min(current.startX, current.currentX);
          const y0 = Math.min(current.startY, current.currentY);
          const x1 = Math.max(current.startX, current.currentX);
          const y1 = Math.max(current.startY, current.currentY);
          const x = clamp(x0, 0, source.naturalWidth - 1);
          const y = clamp(y0, 0, source.naturalHeight - 1);
          const w = Math.max(MIN_BOX_SIDE, Math.min(source.naturalWidth - x, x1 - x0));
          const h = Math.max(MIN_BOX_SIDE, Math.min(source.naturalHeight - y, y1 - y0));
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
      } else if (current.kind === 'move') {
        const doc = useEditStore.getState().document;
        if (doc?.present.faceBlur) {
          commit(
            produce(doc.present, (d) => {
              const b = d.faceBlur?.boxes[current.targetIndex];
              if (b) {
                b.x = current.nextX;
                b.y = current.nextY;
              }
            }),
          );
        }
      } else {
        // resize
        const x0 = Math.min(current.anchorX, current.currentX);
        const y0 = Math.min(current.anchorY, current.currentY);
        const x1 = Math.max(current.anchorX, current.currentX);
        const y1 = Math.max(current.anchorY, current.currentY);
        const x = clamp(x0, 0, source.naturalWidth - MIN_BOX_SIDE);
        const y = clamp(y0, 0, source.naturalHeight - MIN_BOX_SIDE);
        const w = Math.max(MIN_BOX_SIDE, Math.min(source.naturalWidth - x, x1 - x0));
        const h = Math.max(MIN_BOX_SIDE, Math.min(source.naturalHeight - y, y1 - y0));
        const doc = useEditStore.getState().document;
        if (doc?.present.faceBlur) {
          commit(
            produce(doc.present, (d) => {
              const b = d.faceBlur?.boxes[current.targetIndex];
              if (b) {
                b.x = x;
                b.y = y;
                b.w = w;
                b.h = h;
              }
            }),
          );
        }
      }
      setDrag(null);
    },
    [source, commit],
  );

  if (!source || !faceBlur) return null;

  const boxes = faceBlur.boxes;
  const sx = previewWidth / source.naturalWidth;
  const sy = previewHeight / source.naturalHeight;

  // Resolve the visual rect to render for each box depending on drag mode.
  function rectFor(i: number, b: FaceBox): { x: number; y: number; w: number; h: number } {
    const current = drag;
    if (!current) return b;
    if (current.kind === 'move' && current.targetIndex === i) {
      return { x: current.nextX, y: current.nextY, w: current.w, h: current.h };
    }
    if (current.kind === 'resize' && current.targetIndex === i) {
      const x0 = Math.min(current.anchorX, current.currentX);
      const y0 = Math.min(current.anchorY, current.currentY);
      const x1 = Math.max(current.anchorX, current.currentX);
      const y1 = Math.max(current.anchorY, current.currentY);
      return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
    }
    return b;
  }

  // Live preview rect while create-dragging, in preview-pixel coords.
  let createRect: { left: number; top: number; width: number; height: number } | null = null;
  if (drag?.kind === 'create') {
    const x0 = Math.min(drag.startX, drag.currentX);
    const y0 = Math.min(drag.startY, drag.currentY);
    const x1 = Math.max(drag.startX, drag.currentX);
    const y1 = Math.max(drag.startY, drag.currentY);
    createRect = {
      left: x0 * sx,
      top: y0 * sy,
      width: Math.max(1, (x1 - x0) * sx),
      height: Math.max(1, (y1 - y0) * sy),
    };
  }

  const cursorFor = (): string => {
    if (!pickMode) return 'default';
    if (drag?.kind === 'resize') return 'nwse-resize';
    if (drag?.kind === 'move') return 'grabbing';
    return 'crosshair';
  };

  return (
    <div
      className="absolute inset-0 z-10"
      style={{
        pointerEvents: pickMode ? 'auto' : 'none',
        cursor: cursorFor(),
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {pickMode &&
        boxes.map((b, i) => {
          const r = rectFor(i, b);
          const left = r.x * sx;
          const top = r.y * sy;
          const width = r.w * sx;
          const height = r.h * sy;
          return (
            <div
              key={`box-${String(i)}`}
              className="absolute border-2 border-[var(--color-accent)] bg-[var(--color-accent)]/10"
              style={{
                left: `${String(left)}px`,
                top: `${String(top)}px`,
                width: `${String(width)}px`,
                height: `${String(height)}px`,
                // pointer-events: none so the parent overlay handles the
                // pointerdown — hitTest() decides the gesture. Keeping
                // this null means we don't have to deal with nested
                // pointer capture / event-target mess.
                pointerEvents: 'none',
              }}
              aria-label={`Face blur region ${String(i + 1)}`}
            >
              {/* Corner handles (visible only; pointer events flow through
                  to the overlay, hitTest detects handle proximity). */}
              {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
                <span
                  key={corner}
                  aria-hidden="true"
                  className="absolute size-2.5 rounded-sm border border-[var(--color-bg-elev)] bg-[var(--color-accent)]"
                  style={{
                    left: corner === 'nw' || corner === 'sw' ? '-6px' : undefined,
                    right: corner === 'ne' || corner === 'se' ? '-6px' : undefined,
                    top: corner === 'nw' || corner === 'ne' ? '-6px' : undefined,
                    bottom: corner === 'sw' || corner === 'se' ? '-6px' : undefined,
                  }}
                />
              ))}
            </div>
          );
        })}
      {createRect && (
        <div
          className="absolute border-2 border-dashed border-[var(--color-accent)] bg-[var(--color-accent)]/20"
          style={{
            left: `${String(createRect.left)}px`,
            top: `${String(createRect.top)}px`,
            width: `${String(createRect.width)}px`,
            height: `${String(createRect.height)}px`,
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
