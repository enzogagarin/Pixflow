import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useEditStore } from '../state/store';
import { useViewport } from '../viewport/use-viewport';
import { usePreviewRender } from '../viewport/use-preview-render';
import { CompareSlider } from './CompareSlider';
import { ZoomControls } from './ZoomControls';

/**
 * The main canvas viewport. Hosts two stacked canvases:
 *   - `original` (bottom layer): the un-edited preview bitmap, painted
 *     once via 2D drawImage. Used by the compare slider.
 *   - `edited` (top layer): driven by PreviewEngine; pixflow renders
 *     pipeline output here as a side effect of textureToBlob.
 *
 * Both canvases live inside a transform wrapper that applies
 * `translate(offsetX, offsetY) scale(scale)` from the viewport hook.
 * The container measures itself via ResizeObserver so the preview
 * downscale target adjusts when the window resizes.
 */
export function CanvasViewport() {
  const containerRef = useRef<HTMLDivElement>(null);
  const editedRef = useRef<HTMLCanvasElement>(null);
  const originalRef = useRef<HTMLCanvasElement>(null);
  const document = useEditStore((s) => s.document);
  const source = document?.present.source ?? null;

  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  // editedCanvas is tracked via state (not just ref) so usePreviewRender's
  // effect re-runs when the canvas mounts.
  const [editedCanvas, setEditedCanvas] = useState<HTMLCanvasElement | null>(null);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { previewBitmap } = usePreviewRender({
    canvas: editedCanvas,
    containerWidth: containerSize.width,
  });

  const viewport = useViewport({
    containerRef,
    imageWidth: previewBitmap?.width ?? source?.naturalWidth ?? 1,
    imageHeight: previewBitmap?.height ?? source?.naturalHeight ?? 1,
  });

  // Paint the original canvas once whenever previewBitmap changes.
  useEffect(() => {
    const c = originalRef.current;
    if (!c || !previewBitmap) return;
    c.width = previewBitmap.width;
    c.height = previewBitmap.height;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(previewBitmap, 0, 0);
  }, [previewBitmap]);

  // Compare slider toggle (`/` key).
  const [compare, setCompare] = useState(false);
  const [splitPct, setSplitPct] = useState(50);
  useEffect(() => {
    function isTyping(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable;
    }
    function down(e: KeyboardEvent): void {
      if (isTyping(e.target)) return;
      if (e.key === '/') {
        e.preventDefault();
        setCompare((v) => !v);
      }
    }
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, []);

  if (!document) {
    return null;
  }

  const { scale, offsetX, offsetY } = viewport.transform;

  return (
    <div className="flex flex-1 flex-col gap-2">
      <div
        ref={containerRef}
        onWheel={viewport.onWheel}
        onPointerDown={viewport.onPointerDown}
        className={`relative w-full flex-1 min-h-[60vh] overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] ${
          viewport.panMode ? 'cursor-grab' : 'cursor-default'
        }`}
        role="img"
        aria-label="Edit preview"
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            transformOrigin: '0 0',
            transform: `translate(${offsetX.toString()}px, ${offsetY.toString()}px) scale(${scale.toString()})`,
            width: previewBitmap?.width ?? 0,
            height: previewBitmap?.height ?? 0,
          }}
        >
          <canvas
            ref={originalRef}
            className="absolute inset-0 block"
            style={{ width: '100%', height: '100%' }}
          />
          <canvas
            ref={(el) => {
              editedRef.current = el;
              setEditedCanvas(el);
            }}
            className="absolute inset-0 block"
            style={
              compare
                ? {
                    width: '100%',
                    height: '100%',
                    clipPath: `inset(0 0 0 ${splitPct.toString()}%)`,
                  }
                : { width: '100%', height: '100%' }
            }
          />
        </div>
        {compare && <CompareSlider value={splitPct} onChange={setSplitPct} />}
      </div>
      <div className="flex items-center justify-end">
        <ZoomControls
          scale={viewport.transform.scale}
          onZoomIn={() => viewport.zoomBy(1.25)}
          onZoomOut={() => viewport.zoomBy(0.8)}
          onFit={viewport.fit}
          onActualSize={() => viewport.setZoom(1)}
        />
      </div>
    </div>
  );
}
