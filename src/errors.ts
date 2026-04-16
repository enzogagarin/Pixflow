export const ErrorCode = {
  WEBGPU_UNAVAILABLE: 'WEBGPU_UNAVAILABLE',
  ADAPTER_REQUEST_FAILED: 'ADAPTER_REQUEST_FAILED',
  DEVICE_REQUEST_FAILED: 'DEVICE_REQUEST_FAILED',
  DEVICE_LOST: 'DEVICE_LOST',
  OUT_OF_MEMORY: 'OUT_OF_MEMORY',
  INVALID_INPUT: 'INVALID_INPUT',
  SHADER_COMPILE: 'SHADER_COMPILE',
  ENCODING_FAILED: 'ENCODING_FAILED',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface PixflowErrorOptions {
  cause?: unknown;
  details?: Record<string, unknown>;
  /** Human-readable hint appended to the message (" — Suggestion: ..."). */
  suggestion?: string;
}

// Built-in suggestions keyed by error code. Callers can override via options.
const DEFAULT_SUGGESTIONS: Partial<Record<ErrorCodeValue, string>> = {
  WEBGPU_UNAVAILABLE:
    'WebGPU requires Chrome 113+, Edge 113+, Safari 18+, or Firefox 141+. Check chrome://gpu for device support.',
  ADAPTER_REQUEST_FAILED:
    'No GPU adapter is available. On Linux, try launching the browser with --enable-unsafe-webgpu, or fall back to a CPU path.',
  DEVICE_REQUEST_FAILED:
    'The requested GPU features or limits may not be supported. Try acquireDevice() with no required features.',
  DEVICE_LOST:
    'The GPU device was lost. Create a new Pipeline (or call dispose() and reuse) to re-acquire the device.',
  OUT_OF_MEMORY:
    'Reduce the batch size or the concurrency option, shrink large textures, or free unused Pipelines via dispose().',
  SHADER_COMPILE:
    'This usually indicates an internal bug. Please file an issue with the filter name and your browser/GPU.',
};

export class PixflowError extends Error {
  public readonly code: ErrorCodeValue;
  public readonly details: Record<string, unknown> | undefined;
  public readonly suggestion: string | undefined;

  constructor(code: ErrorCodeValue, message: string, options: PixflowErrorOptions = {}) {
    const suggestion = options.suggestion ?? DEFAULT_SUGGESTIONS[code];
    const fullMessage = suggestion ? `${message} — Suggestion: ${suggestion}` : message;
    super(fullMessage, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'PixflowError';
    this.code = code;
    this.details = options.details;
    this.suggestion = suggestion;
    Object.setPrototypeOf(this, PixflowError.prototype);
  }

  static is(value: unknown): value is PixflowError {
    return value instanceof PixflowError;
  }
}
