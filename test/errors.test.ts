import { describe, expect, it } from 'vitest';
import { ErrorCode, PixflowError } from '../src/errors.js';

describe('PixflowError', () => {
  it('carries a stable code and message', () => {
    const err = new PixflowError(ErrorCode.INVALID_INPUT, 'bad file');
    expect(err.code).toBe('INVALID_INPUT');
    expect(err.message).toBe('bad file');
    expect(err.name).toBe('PixflowError');
  });

  it('preserves cause via standard Error options', () => {
    const inner = new Error('underlying');
    const err = new PixflowError(ErrorCode.INTERNAL, 'wrapped', { cause: inner });
    expect(err.cause).toBe(inner);
  });

  it('is identifiable via PixflowError.is even across realms', () => {
    const err = new PixflowError(ErrorCode.WEBGPU_UNAVAILABLE, 'no gpu');
    expect(PixflowError.is(err)).toBe(true);
    expect(PixflowError.is(new Error('x'))).toBe(false);
  });

  it('exports all documented error codes', () => {
    const expected = [
      'WEBGPU_UNAVAILABLE',
      'ADAPTER_REQUEST_FAILED',
      'DEVICE_REQUEST_FAILED',
      'DEVICE_LOST',
      'OUT_OF_MEMORY',
      'INVALID_INPUT',
      'SHADER_COMPILE',
      'ENCODING_FAILED',
      'INTERNAL',
    ];
    for (const key of expected) {
      expect(Object.values(ErrorCode)).toContain(key);
    }
  });
});
