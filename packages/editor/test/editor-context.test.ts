import { describe, it, expect, vi } from 'vitest';
import { createEditorContext } from '../src/context/editor-context';

const fakeDevice = { destroy: vi.fn() } as unknown as GPUDevice;

describe('createEditorContext', () => {
  it('acquires a device exactly once even when called concurrently', async () => {
    const acquire = vi.fn(async () => ({ device: fakeDevice, adapter: {} as GPUAdapter }));
    const ctx = createEditorContext({ acquire });
    const [a, b] = await Promise.all([ctx.ensure(), ctx.ensure()]);
    expect(acquire).toHaveBeenCalledTimes(1);
    expect(a.device).toBe(fakeDevice);
    expect(b.device).toBe(fakeDevice);
  });

  it('after dispose, ensure() rejects', async () => {
    const acquire = vi.fn(async () => ({ device: fakeDevice, adapter: {} as GPUAdapter }));
    const ctx = createEditorContext({ acquire });
    await ctx.ensure();
    ctx.dispose();
    await expect(ctx.ensure()).rejects.toThrow(/disposed/);
  });

  it('dispose() destroys the device exactly once', async () => {
    const destroy = vi.fn();
    const dev = { destroy } as unknown as GPUDevice;
    const acquire = vi.fn(async () => ({ device: dev, adapter: {} as GPUAdapter }));
    const ctx = createEditorContext({ acquire });
    await ctx.ensure();
    ctx.dispose();
    ctx.dispose();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('dispose() before ensure() resolves still destroys the device when it arrives', async () => {
    const destroy = vi.fn();
    const dev = { destroy } as unknown as GPUDevice;
    let release: () => void = () => {};
    const acquire = vi.fn(
      () =>
        new Promise<{ device: GPUDevice; adapter: GPUAdapter }>((res) => {
          release = () => res({ device: dev, adapter: {} as GPUAdapter });
        }),
    );
    const ctx = createEditorContext({ acquire });
    const pending = ctx.ensure();
    ctx.dispose();
    release();
    await expect(pending).rejects.toThrow(/disposed/);
    await new Promise((r) => setTimeout(r, 0));
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
