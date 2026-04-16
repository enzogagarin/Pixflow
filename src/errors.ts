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
}

export class PixflowError extends Error {
  public readonly code: ErrorCodeValue;
  public readonly details: Record<string, unknown> | undefined;

  constructor(code: ErrorCodeValue, message: string, options: PixflowErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'PixflowError';
    this.code = code;
    this.details = options.details;
    Object.setPrototypeOf(this, PixflowError.prototype);
  }

  static is(value: unknown): value is PixflowError {
    return value instanceof PixflowError;
  }
}
