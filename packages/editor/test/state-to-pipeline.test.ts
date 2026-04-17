import { describe, it, expect } from 'vitest';
import { stateToPipeline } from '../src/render/state-to-pipeline';
import { asPipelineFactory, createMockPipeline, makeState } from './test-helpers';

describe('stateToPipeline — empty-state guard', () => {
  it('appends brightness(0) when no other filter would be added (pixflow rejects empty pipelines)', () => {
    const mock = createMockPipeline();
    stateToPipeline(makeState(), 'preview', asPipelineFactory(mock));
    // Identity state: no crop, no rotate, no flip, all colors 0, no detail,
    // no watermark, no resize. Without the no-op, pixflow's runOne would
    // throw "Pipeline has no filters". The brightness(0) guard prevents that;
    // pixflow then strips brightness(0) as identity at runtime.
    expect(mock.brightness).toHaveBeenCalledWith(0);
  });

  it('does NOT append brightness(0) when any other filter is present', () => {
    const mock = createMockPipeline();
    stateToPipeline(
      makeState({
        geometry: { crop: null, rotate: 90, flip: { h: false, v: false } },
      }),
      'preview',
      asPipelineFactory(mock),
    );
    // rotate90 is the real filter; the no-op shouldn't fire.
    expect(mock.brightness).not.toHaveBeenCalled();
  });
});

describe('stateToPipeline — geometry', () => {
  it('omits all geometry calls when crop=null, rotate=0, flip=false/false', () => {
    const mock = createMockPipeline();
    stateToPipeline(makeState(), 'export', asPipelineFactory(mock));
    expect(mock.crop).not.toHaveBeenCalled();
    expect(mock.rotate90).not.toHaveBeenCalled();
    expect(mock.flip).not.toHaveBeenCalled();
  });

  it('applies crop before rotate before flip (order matters)', () => {
    const mock = createMockPipeline();
    const s = makeState({
      geometry: {
        crop: { x: 10, y: 20, w: 100, h: 200 },
        rotate: 90,
        flip: { h: true, v: false },
      },
    });
    stateToPipeline(s, 'export', asPipelineFactory(mock));
    // Adapter translates EditState's w/h to pixflow's width/height.
    expect(mock.crop).toHaveBeenCalledWith({ x: 10, y: 20, width: 100, height: 200 });
    expect(mock.rotate90).toHaveBeenCalledWith(1);
    // Adapter translates EditState's { h, v } booleans to pixflow's FlipAxis.
    expect(mock.flip).toHaveBeenCalledWith('h');
    const cropOrder = mock.crop.mock.invocationCallOrder[0]!;
    const rotateOrder = mock.rotate90.mock.invocationCallOrder[0]!;
    const flipOrder = mock.flip.mock.invocationCallOrder[0]!;
    expect(cropOrder).toBeLessThan(rotateOrder);
    expect(rotateOrder).toBeLessThan(flipOrder);
  });

  it('maps rotate=90 to rotate90(1), rotate=180 to rotate90(2), rotate=270 to rotate90(3)', () => {
    for (const [deg, turns] of [
      [90, 1],
      [180, 2],
      [270, 3],
    ] as const) {
      const mock = createMockPipeline();
      const s = makeState({
        geometry: { crop: null, rotate: deg, flip: { h: false, v: false } },
      });
      stateToPipeline(s, 'export', asPipelineFactory(mock));
      expect(mock.rotate90).toHaveBeenCalledWith(turns);
    }
  });

  it("collapses flip h+v into a single flip('both') call", () => {
    const mock = createMockPipeline();
    const s = makeState({
      geometry: { crop: null, rotate: 0, flip: { h: true, v: true } },
    });
    stateToPipeline(s, 'export', asPipelineFactory(mock));
    expect(mock.flip).toHaveBeenCalledTimes(1);
    expect(mock.flip).toHaveBeenCalledWith('both');
  });

  it("calls flip('v') when only v is true", () => {
    const mock = createMockPipeline();
    const s = makeState({
      geometry: { crop: null, rotate: 0, flip: { h: false, v: true } },
    });
    stateToPipeline(s, 'export', asPipelineFactory(mock));
    expect(mock.flip).toHaveBeenCalledTimes(1);
    expect(mock.flip).toHaveBeenCalledWith('v');
  });
});

describe('stateToPipeline — color', () => {
  it('skips identity color filters (all params zero)', () => {
    const mock = createMockPipeline();
    // Add a non-color filter (rotate) so the empty-state brightness(0)
    // guard doesn't fire — that guard is tested separately above. This
    // test isolates the "color identity → no color call" contract.
    stateToPipeline(
      makeState({ geometry: { crop: null, rotate: 90, flip: { h: false, v: false } } }),
      'export',
      asPipelineFactory(mock),
    );
    expect(mock.brightness).not.toHaveBeenCalled();
    expect(mock.contrast).not.toHaveBeenCalled();
    expect(mock.saturation).not.toHaveBeenCalled();
    expect(mock.whiteBalance).not.toHaveBeenCalled();
  });

  it('applies brightness/contrast/saturation when non-zero', () => {
    const mock = createMockPipeline();
    const s = makeState({
      color: {
        brightness: 0.2,
        contrast: -0.1,
        saturation: 0.05,
        whiteBalance: { temperature: 0, tint: 0 },
      },
    });
    stateToPipeline(s, 'export', asPipelineFactory(mock));
    expect(mock.brightness).toHaveBeenCalledWith(0.2);
    expect(mock.contrast).toHaveBeenCalledWith(-0.1);
    expect(mock.saturation).toHaveBeenCalledWith(0.05);
  });

  it('applies whiteBalance when temperature OR tint is non-zero', () => {
    const tempOnly = createMockPipeline();
    stateToPipeline(
      makeState({
        color: {
          brightness: 0,
          contrast: 0,
          saturation: 0,
          whiteBalance: { temperature: 0.1, tint: 0 },
        },
      }),
      'export',
      asPipelineFactory(tempOnly),
    );
    expect(tempOnly.whiteBalance).toHaveBeenCalledWith({ temperature: 0.1, tint: 0 });

    const tintOnly = createMockPipeline();
    stateToPipeline(
      makeState({
        color: {
          brightness: 0,
          contrast: 0,
          saturation: 0,
          whiteBalance: { temperature: 0, tint: -0.05 },
        },
      }),
      'export',
      asPipelineFactory(tintOnly),
    );
    expect(tintOnly.whiteBalance).toHaveBeenCalledWith({ temperature: 0, tint: -0.05 });
  });
});

describe('stateToPipeline — detail', () => {
  it('skips sharpen when null', () => {
    const mock = createMockPipeline();
    stateToPipeline(makeState(), 'export', asPipelineFactory(mock));
    expect(mock.unsharpMask).not.toHaveBeenCalled();
  });

  it('applies sharpen when set', () => {
    const mock = createMockPipeline();
    stateToPipeline(
      makeState({
        detail: { sharpen: { amount: 0.5, radius: 1.5 }, blur: null },
      }),
      'export',
      asPipelineFactory(mock),
    );
    expect(mock.unsharpMask).toHaveBeenCalledWith({ amount: 0.5, radius: 1.5 });
  });

  it('skips blur when null', () => {
    const mock = createMockPipeline();
    stateToPipeline(makeState(), 'export', asPipelineFactory(mock));
    expect(mock.gaussianBlur).not.toHaveBeenCalled();
  });

  it('applies blur with radius derived from sigma (3σ rule)', () => {
    const mock = createMockPipeline();
    stateToPipeline(
      makeState({
        detail: { sharpen: null, blur: { sigma: 3 } },
      }),
      'export',
      asPipelineFactory(mock),
    );
    expect(mock.gaussianBlur).toHaveBeenCalledWith({ radius: 9, sigma: 3 });
  });

  it('clamps blur radius to at least 1 when sigma is very small', () => {
    const mock = createMockPipeline();
    stateToPipeline(
      makeState({
        detail: { sharpen: null, blur: { sigma: 0.1 } },
      }),
      'export',
      asPipelineFactory(mock),
    );
    expect(mock.gaussianBlur).toHaveBeenCalledWith({ radius: 1, sigma: 0.1 });
  });
});

describe('stateToPipeline — watermark', () => {
  it('skips watermark when null', () => {
    const mock = createMockPipeline();
    stateToPipeline(makeState(), 'export', asPipelineFactory(mock));
    expect(mock.watermark).not.toHaveBeenCalled();
  });

  it('forwards watermark spec verbatim when set', () => {
    const mock = createMockPipeline();
    const wmImage = {} as unknown as ImageBitmap;
    const wm = { image: wmImage, position: 'bottom-right' as const, opacity: 0.3, scale: 0.15 };
    stateToPipeline(
      makeState({ watermark: wm }),
      'export',
      asPipelineFactory(mock),
    );
    expect(mock.watermark).toHaveBeenCalledWith(wm);
  });
});

describe('stateToPipeline — output + modes', () => {
  it('skips resize when null', () => {
    const mock = createMockPipeline();
    stateToPipeline(makeState(), 'export', asPipelineFactory(mock));
    expect(mock.resize).not.toHaveBeenCalled();
  });

  it('bridges EditState.maxWidth → pixflow.width when only width is set', () => {
    const mock = createMockPipeline();
    stateToPipeline(
      makeState({
        output: {
          resize: { maxWidth: 1200, fit: 'inside' },
          format: 'image/webp',
          quality: 0.9,
          metadataStrip: { mode: 'aggressive' },
        },
      }),
      'export',
      asPipelineFactory(mock),
    );
    expect(mock.resize).toHaveBeenCalledWith({ width: 1200, fit: 'inside' });
  });

  it('bridges both maxWidth + maxHeight when set', () => {
    const mock = createMockPipeline();
    stateToPipeline(
      makeState({
        output: {
          resize: { maxWidth: 1600, maxHeight: 900, fit: 'cover' },
          format: 'image/webp',
          quality: 0.9,
          metadataStrip: { mode: 'aggressive' },
        },
      }),
      'export',
      asPipelineFactory(mock),
    );
    expect(mock.resize).toHaveBeenCalledWith({
      width: 1600,
      height: 900,
      fit: 'cover',
    });
  });

  it('skips resize when spec has neither maxWidth nor maxHeight (pixflow rejects empty)', () => {
    const mock = createMockPipeline();
    stateToPipeline(
      makeState({
        output: {
          resize: { fit: 'inside' },
          format: 'image/webp',
          quality: 0.9,
          metadataStrip: { mode: 'aggressive' },
        },
      }),
      'export',
      asPipelineFactory(mock),
    );
    expect(mock.resize).not.toHaveBeenCalled();
  });

  it('in export mode, encode uses state.output.format + quality', () => {
    const mock = createMockPipeline();
    stateToPipeline(
      makeState({
        output: {
          resize: null,
          format: 'image/jpeg',
          quality: 0.85,
          metadataStrip: { mode: 'aggressive' },
        },
      }),
      'export',
      asPipelineFactory(mock),
    );
    expect(mock.encode).toHaveBeenCalledWith({ format: 'image/jpeg', quality: 0.85 });
  });

  it("in preview mode, encode uses image/png at quality=1 regardless of state.output", () => {
    const mock = createMockPipeline();
    stateToPipeline(
      makeState({
        output: {
          resize: null,
          format: 'image/jpeg',
          quality: 0.5,
          metadataStrip: { mode: 'aggressive' },
        },
      }),
      'preview',
      asPipelineFactory(mock),
    );
    expect(mock.encode).toHaveBeenCalledWith({ format: 'image/png', quality: 1 });
  });

  it('encode is always the final call', () => {
    const mock = createMockPipeline();
    const s = makeState({
      color: { brightness: 0.1, contrast: 0, saturation: 0, whiteBalance: { temperature: 0, tint: 0 } },
      output: {
        resize: { maxWidth: 800, fit: 'inside' },
        format: 'image/webp',
        quality: 0.82,
        metadataStrip: { mode: 'aggressive' },
      },
    });
    stateToPipeline(s, 'export', asPipelineFactory(mock));
    const encodeOrder = mock.encode.mock.invocationCallOrder[0]!;
    const brightnessOrder = mock.brightness.mock.invocationCallOrder[0]!;
    const resizeOrder = mock.resize.mock.invocationCallOrder[0]!;
    expect(brightnessOrder).toBeLessThan(encodeOrder);
    expect(resizeOrder).toBeLessThan(encodeOrder);
  });
});

describe('stateToPipeline — return value', () => {
  it('returns the pipeline built by the factory', () => {
    const mock = createMockPipeline();
    const result = stateToPipeline(makeState(), 'export', asPipelineFactory(mock));
    expect(result).toBe(mock);
  });
});
