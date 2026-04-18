import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useEditStore } from '../../state/store';
import { useT } from '../../i18n/useT';
import type { EditState, WatermarkSpec } from '../../state/types';
import type { WatermarkPosition } from 'pixflow';
import { InspectorSlider } from './InspectorSlider';
import { Segmented } from './Segmented';

const WATERMARK_DEFAULTS = {
  position: 'bottom-right' as WatermarkPosition,
  opacity: 0.5,
  scale: 0.2,
  margin: 16,
};

/**
 * Watermark picker + config. UX flow:
 *   - No watermark: shows "Pick image" button. Click → file dialog →
 *     decode → commit { image, ...defaults }.
 *   - Watermark set: shows a small thumbnail + "Replace" + "Remove"
 *     buttons + the position segmented + opacity / scale / margin
 *     sliders, all bound to state.watermark fields.
 *
 * Pixflow's WatermarkParams accepts ImageBitmap | Blob | HTMLImageElement.
 * We always decode to ImageBitmap here so the runtime never has to do
 * second-pass decoding; matches how the main DropZone handles the
 * source image (PR #4).
 *
 * Why no immer here: WatermarkSpec.image's union includes HTMLImageElement,
 * whose recursive DOM type chain (parentElement → readonly Element[] etc.)
 * blows up immer's WritableDraft<T> with exactOptionalPropertyTypes on.
 * Plain spread for one-level nested writes is just as readable and skirts
 * the issue entirely. Other inspector sections still use immer because
 * their state slots only contain scalars.
 *
 * Memory: replacing or removing a watermark drops the previous bitmap
 * reference but does NOT call .close() — past history entries may still
 * hold it. HISTORY_MAX (50) bounds the worst case at 50 retained
 * bitmaps; acceptable for a session-only editor.
 */
export function WatermarkConfig() {
  const t = useT();
  const watermark = useEditStore((s) => s.document?.present.watermark ?? null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const positionOptions = useMemo(
    (): readonly { value: WatermarkPosition; label: string }[] => [
      { value: 'top-left', label: t('watermark.position.topLeft') },
      { value: 'top-right', label: t('watermark.position.topRight') },
      { value: 'bottom-left', label: t('watermark.position.bottomLeft') },
      { value: 'bottom-right', label: t('watermark.position.bottomRight') },
      { value: 'center', label: t('watermark.position.center') },
      { value: 'tile', label: t('watermark.position.tile') },
    ],
    [t],
  );

  // Derive a thumbnail URL whenever the watermark image changes.
  // We turn the ImageBitmap back into a blob via a canvas just to get a
  // displayable src — there's no DOM-native ImageBitmap renderer for
  // <img>. URL.createObjectURL is paired with a cleanup revoke to avoid
  // leaks across re-renders.
  useEffect(() => {
    if (!watermark) {
      setThumbnailUrl(null);
      return;
    }
    const image = watermark.image;
    if (!(image instanceof ImageBitmap)) {
      setThumbnailUrl(null);
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(image, 0, 0);
    let url: string | null = null;
    canvas.toBlob((blob) => {
      if (!blob) return;
      url = URL.createObjectURL(blob);
      setThumbnailUrl(url);
    });
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [watermark]);

  const onPickFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onFileChange = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError(`"${file.name}" is not an image file.`);
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const store = useEditStore.getState();
      if (!store.document) return;
      const present = store.document.present;
      const nextWm: WatermarkSpec = present.watermark
        ? { ...present.watermark, image: bitmap }
        : { image: bitmap, ...WATERMARK_DEFAULTS };
      store.commit({ ...present, watermark: nextWm });
    } catch (err) {
      setError(`Failed to decode ${file.name}: ${String(err)}`);
    }
  }, []);

  const onRemove = useCallback(() => {
    const store = useEditStore.getState();
    if (!store.document) return;
    const present = store.document.present;
    store.commit({ ...present, watermark: null });
  }, []);

  const onPositionChange = useCallback((next: WatermarkPosition) => {
    const store = useEditStore.getState();
    if (!store.document?.present.watermark) return;
    const present = store.document.present;
    store.commit({
      ...present,
      watermark: { ...present.watermark!, position: next },
    });
  }, []);

  const setOpacity = useCallback((v: number): EditState => {
    const present = useEditStore.getState().document!.present;
    if (!present.watermark) return present;
    return { ...present, watermark: { ...present.watermark, opacity: v } };
  }, []);
  const setScale = useCallback((v: number): EditState => {
    const present = useEditStore.getState().document!.present;
    if (!present.watermark) return present;
    return { ...present, watermark: { ...present.watermark, scale: v } };
  }, []);
  const setMargin = useCallback((v: number): EditState => {
    const present = useEditStore.getState().document!.present;
    if (!present.watermark) return present;
    return { ...present, watermark: { ...present.watermark, margin: v } };
  }, []);

  return (
    <div className="flex flex-col gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-[var(--font-mono)] text-xs">{t('watermark.title')}</span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFileChange}
          aria-hidden="true"
          tabIndex={-1}
        />
        {watermark ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onPickFile}
              className="rounded border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-2 py-0.5 font-[var(--font-mono)] text-[10px] text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              {t('watermark.replace')}
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="rounded border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-2 py-0.5 font-[var(--font-mono)] text-[10px] text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              {t('watermark.remove')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onPickFile}
            className="rounded border border-[var(--color-accent)] bg-[var(--color-accent-dim)] px-2 py-0.5 font-[var(--font-mono)] text-[10px] text-[var(--color-accent)] hover:brightness-110"
          >
            {t('watermark.pickImage')}
          </button>
        )}
      </div>

      {error !== null && (
        <p className="font-[var(--font-mono)] text-[10px] text-[var(--color-muted)]">{error}</p>
      )}

      {watermark && (
        <>
          {thumbnailUrl && (
            <img
              src={thumbnailUrl}
              alt="Watermark preview"
              className="max-h-16 w-fit self-start rounded border border-[var(--color-border)] bg-[var(--color-bg-elev)] object-contain"
            />
          )}
          <div className="flex items-center justify-between">
            <span className="font-[var(--font-mono)] text-xs text-[var(--color-muted)]">
              {t('watermark.position')}
            </span>
            <Segmented
              value={watermark.position ?? WATERMARK_DEFAULTS.position}
              options={positionOptions}
              onChange={onPositionChange}
              ariaLabel={t('watermark.position')}
            />
          </div>
          <InspectorSlider
            label={t('watermark.opacity')}
            value={watermark.opacity ?? WATERMARK_DEFAULTS.opacity}
            min={0}
            max={1}
            step={0.05}
            resetValue={WATERMARK_DEFAULTS.opacity}
            precision={2}
            getNextState={setOpacity}
          />
          <InspectorSlider
            label={t('watermark.scale')}
            value={watermark.scale ?? WATERMARK_DEFAULTS.scale}
            min={0.05}
            max={1}
            step={0.05}
            resetValue={WATERMARK_DEFAULTS.scale}
            precision={2}
            getNextState={setScale}
          />
          <InspectorSlider
            label={t('watermark.margin')}
            value={watermark.margin ?? WATERMARK_DEFAULTS.margin}
            min={0}
            max={100}
            step={1}
            resetValue={WATERMARK_DEFAULTS.margin}
            precision={0}
            getNextState={setMargin}
          />
        </>
      )}
    </div>
  );
}
