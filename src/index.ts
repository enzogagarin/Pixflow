export { Pipeline, process, processWithStats } from './pipeline/pipeline.js';
export type {
  PipelineOptions,
  RunOptions,
  BatchOptions,
  ProcessOptions,
  LogLevel,
} from './pipeline/pipeline.js';
export { PipelineCache } from './pipeline/pipeline-cache.js';
export type { PipelineCacheOptions } from './pipeline/pipeline-cache.js';

export { PixflowError, ErrorCode } from './errors.js';
export type { ErrorCodeValue, PixflowErrorOptions } from './errors.js';

export { acquireDevice, isWebGPUSupported, trackDevice } from './backends/webgpu/device.js';
export type {
  AcquireDeviceOptions,
  AcquiredDevice,
  TrackedDevice,
} from './backends/webgpu/device.js';

export {
  imageToTexture,
  createIntermediateTexture,
  sourceToImageBitmap,
} from './resources/image-import.js';
export type { ImportedImage } from './resources/image-import.js';

export { TexturePool } from './resources/texture-pool.js';
export type { TexturePoolOptions } from './resources/texture-pool.js';

export { textureToBlob, textureToCanvas } from './codec/readback.js';
export type { ReadbackOptions } from './codec/readback.js';

export {
  encodeCanvas,
  isAvifEncodingSupported,
  resetAvifSupportCache,
  DEFAULT_ENCODE_FORMAT,
} from './codec/encode.js';
export type { EncodeResult, EncodeRequest } from './codec/encode.js';

export {
  BrightnessFilter,
  ContrastFilter,
  SaturationFilter,
  GaussianBlurFilter,
  UnsharpMaskFilter,
  ResizeFilter,
  CropFilter,
  Rotate90Filter,
  FlipFilter,
  PadFilter,
  CurvesFilter,
  WhiteBalanceFilter,
  ColorMatrixFilter,
  ComputeFilter,
  computeResizedDims,
  buildLut,
  computeGain,
  IDENTITY_MATRIX,
  GRAYSCALE_MATRIX,
  SEPIA_MATRIX,
  WORKGROUP_SIZE,
  alignTo,
} from './filters/index.js';
export { AutoOrientFilter } from './filters/auto-orient.js';
export type {
  BrightnessParams,
  ContrastParams,
  SaturationParams,
  GaussianBlurParams,
  UnsharpMaskParams,
  ResizeParams,
  ResizeFit,
  CropParams,
  Rotate90Params,
  FlipParams,
  FlipAxis,
  PadParams,
  PadColor,
  CurvesParams,
  CurvePoint,
  WhiteBalanceParams,
  ColorMatrixParams,
  ComputeFilterShape,
} from './filters/index.js';

export { isExifOrientation, orientFilters, readExifOrientation } from './utils/exif.js';
export type { ExifOrientation } from './utils/exif.js';

export { PRESETS, getPreset, listPresets } from './presets.js';
export type { PresetName, PresetSpec } from './presets.js';

export type {
  Dims,
  EncodeFormat,
  EncodeOptions,
  ExecutionContext,
  Filter,
  FilterPipeline,
  FilterStage,
  ImageSource,
  PipelineCacheLike,
  PipelineResult,
  PipelineStats,
  TexturePoolLike,
  TexturePoolStats,
} from './types.js';
