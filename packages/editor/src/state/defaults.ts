import type { EditState, ExifTable } from './types';

/**
 * Build a fresh EditState for a newly-loaded image. The defaults reflect
 * the editor's privacy-first posture (metadata strip = aggressive, format
 * = webp at quality 0.9) and the identity of every filter parameter
 * (everything zero/null so the pipeline is a pure re-encode until the
 * user touches a control).
 */
export function freshState(
  file: File,
  bitmap: ImageBitmap,
  exif: ExifTable,
  naturalWidth: number,
  naturalHeight: number,
): EditState {
  return {
    source: { bitmap, file, exif, naturalWidth, naturalHeight },
    geometry: {
      crop: null,
      rotate: 0,
      flip: { h: false, v: false },
    },
    color: {
      brightness: 0,
      contrast: 0,
      saturation: 0,
      whiteBalance: { temperature: 0, tint: 0 },
    },
    detail: { sharpen: null, blur: null },
    watermark: null,
    faceBlur: null,
    output: {
      resize: null,
      format: 'image/webp',
      quality: 0.9,
      metadataStrip: { mode: 'aggressive' },
    },
  };
}

/**
 * True when every user-editable field of `state` is at its identity
 * (rotate=0, flip none, all colors zero, no detail/watermark/faceBlur,
 * no output overrides). Source is excluded — a fresh state for a
 * different image is still considered "fresh".
 *
 * Used by the Inspector's Reset button to dim itself when there's
 * nothing to revert. Cheap O(1) check; no deep equality needed.
 */
export function isFreshEditState(state: EditState): boolean {
  return (
    state.geometry.rotate === 0 &&
    !state.geometry.flip.h &&
    !state.geometry.flip.v &&
    state.geometry.crop === null &&
    state.color.brightness === 0 &&
    state.color.contrast === 0 &&
    state.color.saturation === 0 &&
    state.color.whiteBalance.temperature === 0 &&
    state.color.whiteBalance.tint === 0 &&
    state.detail.sharpen === null &&
    state.detail.blur === null &&
    state.watermark === null &&
    state.faceBlur === null &&
    state.output.resize === null
  );
}
