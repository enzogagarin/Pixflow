import { ErrorCode, PixflowError } from '../../errors.js';

export interface AcquireDeviceOptions {
  readonly powerPreference?: GPUPowerPreference;
  readonly requiredFeatures?: GPUFeatureName[];
  readonly requiredLimits?: Record<string, number>;
}

export interface AcquiredDevice {
  readonly adapter: GPUAdapter;
  readonly device: GPUDevice;
}

export async function isWebGPUSupported(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator) || !navigator.gpu) {
    return false;
  }
  try {
    const adapter = await navigator.gpu.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
}

export async function acquireDevice(options: AcquireDeviceOptions = {}): Promise<AcquiredDevice> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator) || !navigator.gpu) {
    throw new PixflowError(
      ErrorCode.WEBGPU_UNAVAILABLE,
      'WebGPU is not available in this environment. navigator.gpu is undefined.',
    );
  }

  let adapter: GPUAdapter | null;
  try {
    const adapterOptions: GPURequestAdapterOptions = {};
    if (options.powerPreference !== undefined) {
      adapterOptions.powerPreference = options.powerPreference;
    }
    adapter = await navigator.gpu.requestAdapter(adapterOptions);
  } catch (cause) {
    throw new PixflowError(ErrorCode.ADAPTER_REQUEST_FAILED, 'requestAdapter() threw an error.', {
      cause,
    });
  }
  if (!adapter) {
    throw new PixflowError(
      ErrorCode.ADAPTER_REQUEST_FAILED,
      'requestAdapter() returned null. No compatible GPU adapter found.',
    );
  }

  let device: GPUDevice;
  try {
    const descriptor: GPUDeviceDescriptor = {};
    if (options.requiredFeatures) {
      descriptor.requiredFeatures = options.requiredFeatures;
    }
    if (options.requiredLimits) {
      descriptor.requiredLimits = options.requiredLimits;
    }
    device = await adapter.requestDevice(descriptor);
  } catch (cause) {
    throw new PixflowError(
      ErrorCode.DEVICE_REQUEST_FAILED,
      'requestDevice() failed. Requested features or limits may not be supported.',
      { cause },
    );
  }

  device.lost
    .then((info) => {
      if (typeof console !== 'undefined') {
        console.warn(`[pixflow] GPUDevice lost (${info.reason}): ${info.message}`);
      }
    })
    .catch(() => {
      /* ignore */
    });

  return { adapter, device };
}

/**
 * Wrap a GPUDevice with lost-tracking so subsequent operations can fail fast
 * instead of silently queueing commands against a dead device.
 */
export interface TrackedDevice {
  readonly device: GPUDevice;
  /** True once `device.lost` has resolved. */
  isLost(): boolean;
  /** Throws a clear PixflowError if the device has been lost. */
  assertAlive(): void;
  /** Lost reason if available. */
  lostInfo(): GPUDeviceLostInfo | null;
}

export function trackDevice(device: GPUDevice): TrackedDevice {
  let lost: GPUDeviceLostInfo | null = null;
  device.lost
    .then((info) => {
      lost = info;
    })
    .catch(() => {
      /* ignore */
    });
  return {
    device,
    isLost: () => lost !== null,
    lostInfo: () => lost,
    assertAlive(): void {
      if (lost) {
        throw new PixflowError(
          ErrorCode.DEVICE_LOST,
          `GPU device was lost (${lost.reason ?? 'unknown'}): ${lost.message ?? ''}`,
        );
      }
    },
  };
}
