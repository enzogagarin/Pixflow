import { Pipeline, type ResizeParams } from 'pixflow';
import type { EditState } from '../state/types';

export type RenderMode = 'preview' | 'export';

/**
 * Translate an EditState snapshot into a pixflow Pipeline, ready to accept
 * a source via .run(). This function is pure and synchronous — no GPU is
 * touched here. The adapter is the single source of render truth: the
 * editor's preview engine and export engine both call this function so
 * "preview ≠ export" divergence is architecturally impossible.
 *
 * Mode semantics:
 *   - 'preview' forces format=png + quality=1 for the fastest path to a
 *     visually-correct canvas. Preview metadata strip is NOT performed
 *     here (preview never leaves the editor).
 *   - 'export' honors state.output.format + quality. Metadata stripping
 *     happens downstream, after encode, in the export engine (PR #11).
 *
 * Face-blur wiring is intentionally omitted: it requires pixflow's
 * `pixelate` and `regionBlur` filters which land in PR #8, and the
 * full safety-reviewed face-detect flow lands in PR #10. Until then,
 * `state.faceBlur` is ignored by this adapter.
 *
 * Filter order (spec Section 3):
 *   geometry (crop → rotate → flip) → color → detail → watermark → resize → encode
 */
export function stateToPipeline(
  state: EditState,
  mode: RenderMode,
  factory: () => Pipeline = () => Pipeline.create(),
): Pipeline {
  const p = factory();
  // Track whether any real filter was added so we can append a
  // brightness(0) no-op below (see end-of-function comment for why).
  let filtersAdded = 0;

  // 1. Geometry: crop → rotate → flip
  //
  // EditState uses readable field names (w/h, horizontal/vertical); pixflow's
  // filter API is slightly more terse (width/height, 'h'/'v'/'both'). The
  // gap is bridged right here so every other layer speaks one vocabulary.
  if (state.geometry.crop) {
    const { x, y, w, h } = state.geometry.crop;
    p.crop({ x, y, width: w, height: h });
    filtersAdded++;
  }
  if (state.geometry.rotate !== 0) {
    p.rotate90((state.geometry.rotate / 90) as 1 | 2 | 3);
    filtersAdded++;
  }
  if (state.geometry.flip.h && state.geometry.flip.v) {
    p.flip('both');
    filtersAdded++;
  } else if (state.geometry.flip.h) {
    p.flip('h');
    filtersAdded++;
  } else if (state.geometry.flip.v) {
    p.flip('v');
    filtersAdded++;
  }

  // 2. Color
  const c = state.color;
  if (c.brightness !== 0) {
    p.brightness(c.brightness);
    filtersAdded++;
  }
  if (c.contrast !== 0) {
    p.contrast(c.contrast);
    filtersAdded++;
  }
  if (c.saturation !== 0) {
    p.saturation(c.saturation);
    filtersAdded++;
  }
  if (c.whiteBalance.temperature !== 0 || c.whiteBalance.tint !== 0) {
    p.whiteBalance(c.whiteBalance);
    filtersAdded++;
  }

  // 3. Detail
  if (state.detail.sharpen) {
    p.unsharpMask(state.detail.sharpen);
    filtersAdded++;
  }
  if (state.detail.blur) {
    // EditState exposes blur as a single user-facing control (sigma). Pixflow's
    // gaussian-blur filter requires an explicit kernel radius; we derive it
    // here using the standard 3σ rule-of-thumb so UI stays one slider.
    const { sigma } = state.detail.blur;
    p.gaussianBlur({ radius: Math.max(1, Math.ceil(sigma * 3)), sigma });
    filtersAdded++;
  }

  // 4. Watermark (face-blur deferred: see PR #8 / #10)
  if (state.watermark) {
    p.watermark(state.watermark);
    filtersAdded++;
  }

  // 5. Output: resize then encode.
  //
  // EditState's ResizeSpec uses {maxWidth?, maxHeight?, fit} (the
  // user-facing "upper bound" vocabulary), while pixflow's ResizeParams
  // uses {width?, height?, fit}. Bridge here. If neither bound is set,
  // skip the resize call entirely — pixflow throws when both are missing
  // ("resize requires at least one of width or height"), and a spec with
  // no bounds is semantically a no-op anyway.
  if (state.output.resize) {
    const { maxWidth, maxHeight, fit } = state.output.resize;
    if (maxWidth !== undefined || maxHeight !== undefined) {
      const params: ResizeParams = {
        fit,
        ...(maxWidth !== undefined ? { width: maxWidth } : {}),
        ...(maxHeight !== undefined ? { height: maxHeight } : {}),
      };
      p.resize(params);
      filtersAdded++;
    }
  }

  // pixflow's `runOne` rejects pipelines with zero filters ("Pipeline has
  // no filters. Add at least one before calling run()."). For a fresh,
  // unedited image we'd otherwise reach here with only an encode() call,
  // which doesn't count as a filter. Append a brightness(0) no-op — pixflow
  // strips it as an identity filter at runtime and falls into a fast
  // import → encode-only path, so this costs nothing in render work but
  // makes the length check pass. This is the same trick pixflow's own
  // `process()` helper uses (see pipeline.ts).
  if (filtersAdded === 0) p.brightness(0);

  p.encode(
    mode === 'preview'
      ? { format: 'image/png', quality: 1 }
      : { format: state.output.format, quality: state.output.quality },
  );

  return p;
}
