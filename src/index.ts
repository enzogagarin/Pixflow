export { Pipeline } from './pipeline/pipeline.js';
export type { PipelineOptions, RunOptions } from './pipeline/pipeline.js';

export { PixflowError, ErrorCode } from './errors.js';
export type { ErrorCodeValue, PixflowErrorOptions } from './errors.js';

export { acquireDevice, isWebGPUSupported } from './backends/webgpu/device.js';
export type { AcquireDeviceOptions, AcquiredDevice } from './backends/webgpu/device.js';

export {
  imageToTexture,
  createIntermediateTexture,
  sourceToImageBitmap,
} from './resources/image-import.js';
export type { ImportedImage } from './resources/image-import.js';

export { textureToBlob, textureToCanvas } from './codec/readback.js';
export type { ReadbackOptions } from './codec/readback.js';

export {
  BrightnessFilter,
  ContrastFilter,
  ComputeFilter,
  WORKGROUP_SIZE,
} from './filters/index.js';
export type { BrightnessParams, ContrastParams, ComputeFilterShape } from './filters/index.js';

export type {
  EncodeOptions,
  ExecutionContext,
  Filter,
  FilterPipeline,
  FilterStage,
  ImageSource,
  PipelineResult,
  PipelineStats,
} from './types.js';
