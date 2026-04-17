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
