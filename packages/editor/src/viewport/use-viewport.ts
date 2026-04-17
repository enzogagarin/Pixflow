import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
  type WheelEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  fitToContainer,
  identityTransform,
  pan,
  zoomAt,
  type ViewportTransform,
} from './viewport-state';

interface UseViewportArgs {
  readonly containerRef: RefObject<HTMLDivElement | null>;
  readonly imageWidth: number;
  readonly imageHeight: number;
}

interface UseViewportResult {
  readonly transform: ViewportTransform;
  readonly onWheel: (e: WheelEvent<HTMLDivElement>) => void;
  readonly onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  readonly fit: () => void;
  readonly zoomBy: (factor: number) => void;
  readonly setZoom: (scale: number) => void;
  /** True while the user holds Space (Photoshop-style temporary pan). */
  readonly panMode: boolean;
}

/**
 * Manages viewport transform state + interaction handlers for the
 * canvas. Returns React-ready event handlers; the consumer attaches
 * them to the container <div>. On mount and whenever image dimensions
 * change, the transform is reset to "fit". The Space key toggles a
 * temporary pan mode (cursor becomes grab/grabbing); pinch / Ctrl-wheel
 * zooms around the cursor; wheel without modifiers pans. `+` / `-`
 * keys zoom around the viewport center.
 */
export function useViewport(args: UseViewportArgs): UseViewportResult {
  const { containerRef, imageWidth, imageHeight } = args;
  const [transform, setTransform] = useState<ViewportTransform>(identityTransform);
  const [panMode, setPanMode] = useState(false);
  const panRef = useRef(panMode);
  panRef.current = panMode;

  // Fit-to-container on mount and whenever image dims change.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setTransform(
      fitToContainer({
        imageWidth,
        imageHeight,
        containerWidth: el.clientWidth,
        containerHeight: el.clientHeight,
      }),
    );
  }, [containerRef, imageWidth, imageHeight]);

  // Space-key pan mode + `+`/`-` zoom shortcuts. Ignore when typing.
  useEffect(() => {
    function isTyping(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable;
    }
    function down(e: KeyboardEvent): void {
      if (isTyping(e.target)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setPanMode(true);
        return;
      }
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        const el = containerRef.current;
        if (!el) return;
        const cx = el.clientWidth / 2;
        const cy = el.clientHeight / 2;
        setTransform((t) => zoomAt(t, 1.25, { x: cx, y: cy }));
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        const el = containerRef.current;
        if (!el) return;
        const cx = el.clientWidth / 2;
        const cy = el.clientHeight / 2;
        setTransform((t) => zoomAt(t, 0.8, { x: cx, y: cy }));
      }
    }
    function up(e: KeyboardEvent): void {
      if (e.code === 'Space') setPanMode(false);
    }
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [containerRef]);

  const onWheel = useCallback(
    (e: WheelEvent<HTMLDivElement>) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const focal = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.pow(1.0015, -e.deltaY);
        setTransform((t) => zoomAt(t, factor, focal));
      } else {
        setTransform((t) => pan(t, -e.deltaX, -e.deltaY));
      }
    },
    [containerRef],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!panRef.current && e.button !== 1) return;
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const startTransform = transform;
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);
      function onMove(ev: PointerEvent): void {
        setTransform({
          scale: startTransform.scale,
          offsetX: startTransform.offsetX + (ev.clientX - startX),
          offsetY: startTransform.offsetY + (ev.clientY - startY),
        });
      }
      function onUp(ev: PointerEvent): void {
        target.releasePointerCapture(ev.pointerId);
        target.removeEventListener('pointermove', onMove);
        target.removeEventListener('pointerup', onUp);
      }
      target.addEventListener('pointermove', onMove);
      target.addEventListener('pointerup', onUp);
    },
    [transform],
  );

  const fit = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setTransform(
      fitToContainer({
        imageWidth,
        imageHeight,
        containerWidth: el.clientWidth,
        containerHeight: el.clientHeight,
      }),
    );
  }, [containerRef, imageWidth, imageHeight]);

  const zoomBy = useCallback(
    (factor: number) => {
      const el = containerRef.current;
      if (!el) return;
      const cx = el.clientWidth / 2;
      const cy = el.clientHeight / 2;
      setTransform((t) => zoomAt(t, factor, { x: cx, y: cy }));
    },
    [containerRef],
  );

  const setZoom = useCallback((targetScale: number) => {
    setTransform((t) => zoomAt(t, targetScale / t.scale, { x: 0, y: 0 }));
  }, []);

  return { transform, onWheel, onPointerDown, fit, zoomBy, setZoom, panMode };
}
