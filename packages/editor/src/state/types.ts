import type { WatermarkParams } from 'pixflow';

/**
 * Immutable snapshot of one image's edit state. Lives at the heart of the
 * editor: UI controls read/write this shape directly, and the render
 * adapter (`stateToPipeline`) consumes it to configure a pixflow pipeline.
 * See docs/superpowers/specs/2026-04-17-pixflow-editor-architecture-design.md
 * Section 2 for the design rationale.
 */
export interface EditState {
  readonly source: {
    readonly bitmap: ImageBitmap;
    readonly file: File;
    readonly exif: ExifTable;
    readonly naturalWidth: number;
    readonly naturalHeight: number;
  };

  readonly geometry: {
    readonly crop: CropRect | null;
    readonly rotate: 0 | 90 | 180 | 270;
    readonly flip: { readonly h: boolean; readonly v: boolean };
  };

  readonly color: {
    readonly brightness: number;
    readonly contrast: number;
    readonly saturation: number;
    readonly whiteBalance: {
      readonly temperature: number;
      readonly tint: number;
    };
  };

  readonly detail: {
    readonly sharpen: { readonly amount: number; readonly radius: number } | null;
    readonly blur: { readonly sigma: number } | null;
  };

  readonly watermark: WatermarkSpec | null;
  readonly faceBlur: FaceBlurState | null;

  readonly output: {
    readonly resize: ResizeSpec | null;
    readonly format: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif';
    readonly quality: number;
    readonly metadataStrip: MetadataStripSpec;
  };
}

export interface CropRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface ResizeSpec {
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly fit: 'inside' | 'cover';
}

export interface FaceBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly confidence: number;
}

export interface FaceBlurState {
  readonly boxes: readonly FaceBox[];
  readonly style: 'pixelate' | 'gaussian';
  readonly strength: number;
}

export interface MetadataStripSpec {
  readonly mode: 'aggressive' | 'minimal' | 'preserve';
}

/**
 * Loose EXIF placeholder. PR #11 (metadata strippers) replaces this with a
 * real parsed-EXIF shape from exifr. Until then we only need the identity
 * of the value when serializing, not its structured fields.
 */
export type ExifTable = Readonly<Record<string, unknown>>;

/** Re-exported for convenience; editor config uses pixflow's spec directly. */
export type WatermarkSpec = WatermarkParams;
