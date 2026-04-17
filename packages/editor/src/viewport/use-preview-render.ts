import { useEffect, useRef, useState } from 'react';
import { useEditStore } from '../state/store';
import { useEditorContext } from '../context/EditorContextProvider';
import { PreviewEngine } from '../preview/preview-engine';
import { createPreviewBitmap } from '../preview/preview-bitmap';

interface UsePreviewRenderArgs {
  readonly canvas: HTMLCanvasElement | null;
  readonly containerWidth: number;
}

/**
 * Wires the EditStore's `present` state to the on-screen canvas.
 *
 * Lifecycle:
 *   - When (canvas, document.source) become available, async-decode a
 *     downscaled preview bitmap, ensure the GPUDevice, and instantiate
 *     a PreviewEngine. Subscribe to `present` so every state change
 *     calls engine.requestRender(state).
 *   - When source.bitmap changes (new image loaded) or canvas unmounts,
 *     dispose the previous engine + close the previous preview bitmap.
 *
 * Returns the original (un-edited) preview bitmap for the compare
 * overlay to paint into a separate canvas — saves a second decode.
 */
export function usePreviewRender(args: UsePreviewRenderArgs): {
  readonly previewBitmap: ImageBitmap | null;
  readonly ready: boolean;
} {
  const { canvas, containerWidth } = args;
  const editorCtx = useEditorContext();
  const source = useEditStore((s) => s.document?.present.source ?? null);
  const [previewBitmap, setPreviewBitmap] = useState<ImageBitmap | null>(null);
  const [ready, setReady] = useState(false);
  const engineRef = useRef<PreviewEngine | null>(null);

  useEffect(() => {
    if (!canvas || !source) {
      setPreviewBitmap(null);
      setReady(false);
      return;
    }
    let cancelled = false;
    let mountedBitmap: ImageBitmap | null = null;
    let mountedEngine: PreviewEngine | null = null;
    let unsubscribe: (() => void) | null = null;

    (async () => {
      const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
      const preview = await createPreviewBitmap(source.bitmap, {
        naturalWidth: source.naturalWidth,
        naturalHeight: source.naturalHeight,
        containerWidth: Math.max(1, containerWidth),
        devicePixelRatio: dpr,
      });
      if (cancelled) {
        if (preview !== source.bitmap) preview.close();
        return;
      }
      const { device } = await editorCtx.ensure();
      if (cancelled) {
        if (preview !== source.bitmap) preview.close();
        return;
      }

      mountedBitmap = preview;
      setPreviewBitmap(preview);
      const engine = new PreviewEngine({ canvas, previewBitmap: preview, device });
      mountedEngine = engine;
      engineRef.current = engine;

      const present = useEditStore.getState().document?.present;
      if (present) engine.requestRender(present);

      unsubscribe = useEditStore.subscribe((state, prev) => {
        const next = state.document?.present;
        const prevPresent = prev.document?.present;
        if (next && next !== prevPresent) engine.requestRender(next);
      });
      setReady(true);
    })().catch((err) => {
      if (!cancelled) console.error('[usePreviewRender] failed to set up preview', err);
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
      mountedEngine?.dispose();
      if (engineRef.current === mountedEngine) engineRef.current = null;
      if (mountedBitmap && mountedBitmap !== source.bitmap) {
        mountedBitmap.close();
      }
      setReady(false);
    };
  }, [canvas, source, containerWidth, editorCtx]);

  return { previewBitmap, ready };
}
