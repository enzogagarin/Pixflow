import { describe, expect, it, vi } from 'vitest';
import { textureToBlob } from '../src/codec/readback.js';

describe('textureToBlob', () => {
  it('waits for submitted GPU work before encoding the canvas', async () => {
    const order: string[] = [];
    const imageData = { data: new Uint8ClampedArray(32 * 24 * 4) };
    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({
        createImageData: vi.fn(() => imageData),
        putImageData: vi.fn(() => {
          order.push('paint');
        }),
      })),
      convertToBlob: vi.fn(async (opts: ImageEncodeOptions) => {
        order.push(`encode:${opts.type ?? 'unknown'}`);
        return new Blob([new Uint8Array([1])], { type: opts.type ?? 'image/png' });
      }),
    } as unknown as OffscreenCanvas;

    const encoder = {
      copyTextureToBuffer: vi.fn(() => {
        order.push('copy');
      }),
      finish: vi.fn(() => 'command-buffer'),
    };
    const backing = new ArrayBuffer(32 * 24 * 4);
    const fakeBuffer = {
      mapState: 'unmapped',
      mapAsync: vi.fn(async () => {
        order.push('map');
        fakeBuffer.mapState = 'mapped';
      }),
      getMappedRange: vi.fn(() => backing),
      unmap: vi.fn(() => {
        order.push('unmap');
        fakeBuffer.mapState = 'unmapped';
      }),
      destroy: vi.fn(() => {
        order.push('destroy');
      }),
    };

    const fakeDevice = {
      queue: {
        submit: vi.fn(() => {
          order.push('submit');
        }),
        onSubmittedWorkDone: vi.fn(async () => {
          order.push('wait');
        }),
      },
      createCommandEncoder: vi.fn(() => encoder),
      createBuffer: vi.fn(() => fakeBuffer),
    } as unknown as GPUDevice;

    vi.stubGlobal('GPUBufferUsage', {
      COPY_DST: 1,
      MAP_READ: 2,
    });
    vi.stubGlobal('GPUMapMode', {
      READ: 1,
    });

    const fakeTexture = { width: 32, height: 24 } as GPUTexture;

    const result = await textureToBlob(fakeDevice, fakeTexture, {
      canvas: fakeCanvas,
      format: 'image/webp',
      quality: 0.82,
    });

    expect(result.format).toBe('image/webp');
    expect(order).toEqual([
      'copy',
      'submit',
      'wait',
      'map',
      'unmap',
      'destroy',
      'paint',
      'encode:image/webp',
    ]);
  });
});
