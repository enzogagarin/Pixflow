import { acquireDevice, type AcquiredDevice } from 'pixflow';

export interface EditorContext {
  /**
   * Resolve (or wait for) the shared GPUDevice. Lazily acquires on first
   * call; concurrent callers receive the same device. Rejects with a
   * "disposed" error if dispose() ran before/during acquisition.
   */
  ensure(): Promise<{ device: GPUDevice }>;
  /** Synchronous accessor; returns null until ensure() has resolved. */
  current(): { device: GPUDevice } | null;
  /** Destroy the device (if acquired) and reject any pending ensure() callers. */
  dispose(): void;
}

interface CreateOptions {
  /** Injectable for tests; defaults to pixflow's acquireDevice. */
  acquire?: () => Promise<AcquiredDevice>;
}

/**
 * One per session. Owns the GPUDevice that all preview/export pipelines
 * share via Pipeline.create({ device }). Pixflow's TexturePool and
 * PipelineCache are per-Pipeline instances (the public API doesn't allow
 * us to inject them), so EditorContext intentionally holds only the
 * device. Sharing the device is what avoids the cross-device validation
 * errors that bit us in the PR #1 batch bug.
 */
export function createEditorContext(opts: CreateOptions = {}): EditorContext {
  const acquire = opts.acquire ?? acquireDevice;
  let acquisition: Promise<{ device: GPUDevice }> | null = null;
  let device: GPUDevice | null = null;
  let disposed = false;

  return {
    ensure() {
      if (disposed) return Promise.reject(new Error('EditorContext disposed'));
      if (!acquisition) {
        acquisition = acquire().then((acq) => {
          if (disposed) {
            acq.device.destroy();
            throw new Error('EditorContext disposed');
          }
          device = acq.device;
          return { device: acq.device };
        });
      }
      return acquisition;
    },
    current() {
      return device ? { device } : null;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (device) {
        device.destroy();
        device = null;
      }
    },
  };
}
