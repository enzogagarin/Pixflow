// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useClipboardPaste } from '../src/hooks/useClipboardPaste';
import { useEditStore } from '../src/state/store';
import { useBatchQueue } from '../src/state/batch-queue';

const dummyBitmap = { width: 320, height: 240 } as ImageBitmap;
const pastedFile = new File([new Uint8Array([1, 2, 3])], 'pasted.png', {
  type: 'image/png',
});

beforeEach(() => {
  useEditStore.getState().clear();
  useBatchQueue.getState().clear();
  vi.restoreAllMocks();
  vi.stubGlobal('createImageBitmap', vi.fn(async () => dummyBitmap));
});

describe('useClipboardPaste', () => {
  it('clears any stale batch queue before loading a pasted image', async () => {
    useBatchQueue
      .getState()
      .set([new File([], 'a.png', { type: 'image/png' }), new File([], 'b.png', { type: 'image/png' })]);
    const onToast = vi.fn();
    renderHook(() => useClipboardPaste(onToast));

    const event = new Event('paste') as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', {
      value: {
        items: [
          {
            type: pastedFile.type,
            getAsFile: () => pastedFile,
          },
        ],
      },
    });

    window.dispatchEvent(event);

    await waitFor(() => {
      expect(useEditStore.getState().document?.present.source.file).toBe(pastedFile);
    });
    expect(useBatchQueue.getState().files).toEqual([]);
    expect(onToast).toHaveBeenCalledWith('pasted');
  });
});
