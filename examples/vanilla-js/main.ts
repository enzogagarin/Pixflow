import {
  acquireDevice,
  isAvifEncodingSupported,
  isWebGPUSupported,
  Pipeline,
  PixflowError,
  PRESETS,
  VideoProcessor,
  type PipelineResult,
  type PresetName,
  type PresetSpec,
} from 'pixflow';
import { buildZip } from './zip.js';

const statusEl = qs<HTMLDivElement>('#status');
const avifStatusEl = qs<HTMLDivElement>('#avif-status');
const deviceStatusEl = qs<HTMLDivElement>('#device-status');
const presetGrid = qs<HTMLDivElement>('#preset-grid');
const dropzone = qs<HTMLDivElement>('#dropzone');
const fileInput = qs<HTMLInputElement>('#file-input');
const browseBtn = qs<HTMLButtonElement>('#browse');
const concurrencyInput = qs<HTMLInputElement>('#concurrency');
const concurrencyOut = qs<HTMLOutputElement>('#concurrency-value');
const watermarkToggle = qs<HTMLInputElement>('#watermark-toggle');
const benchToggle = qs<HTMLInputElement>('#bench-toggle');
const filterTags = qs<HTMLDivElement>('#filter-tags');
const videoPanel = qs<HTMLElement>('#video-panel');
const videoNameEl = qs<HTMLDivElement>('#video-name');
const videoHintEl = qs<HTMLParagraphElement>('#video-hint');
const videoExtractBtn = qs<HTMLButtonElement>('#video-extract');
const videoThumbsBtn = qs<HTMLButtonElement>('#video-thumbs');
const runBtn = qs<HTMLButtonElement>('#run');
const cancelBtn = qs<HTMLButtonElement>('#cancel');
const zipBtn = qs<HTMLButtonElement>('#download-zip');
const clearBtn = qs<HTMLButtonElement>('#clear');
const benchPanel = qs<HTMLElement>('#bench-panel');
const benchPixflowFill = qs<HTMLDivElement>('#bench-pixflow-fill');
const benchCanvasFill = qs<HTMLDivElement>('#bench-canvas-fill');
const benchPixflowValue = qs<HTMLDivElement>('#bench-pixflow-value');
const benchCanvasValue = qs<HTMLDivElement>('#bench-canvas-value');
const benchSummary = qs<HTMLDivElement>('#bench-summary');
const progressPanel = qs<HTMLElement>('#progress-panel');
const progressFill = qs<HTMLDivElement>('#progress-fill');
const progressLabel = qs<HTMLDivElement>('#progress-label');
const resultsEl = qs<HTMLElement>('#results');
const logEl = qs<HTMLElement>('#log');
const smokePixelateBtn = qs<HTMLButtonElement>('#smoke-pixelate');
const smokeRegionBlurBtn = qs<HTMLButtonElement>('#smoke-region-blur');
const smokeResetBtn = qs<HTMLButtonElement>('#smoke-reset');
const smokeStatusEl = qs<HTMLSpanElement>('#smoke-status');
const smokeResultEl = qs<HTMLDivElement>('#smoke-result');
const smokePreviewImg = qs<HTMLImageElement>('#smoke-preview');
let smokePreviewUrl: string | null = null;

interface Slot {
  readonly file: File;
  status: 'pending' | 'running' | 'done' | 'error';
  result?: PipelineResult;
  error?: string;
  card?: HTMLDivElement;
  inputImage?: HTMLImageElement;
  outputImage?: HTMLImageElement;
  inputUrl?: string;
  outputUrl?: string;
}

let slots: Slot[] = [];
let abort: AbortController | null = null;
let activePreset: PresetName = 'forum-post';
let pendingVideo: File | null = null;
let watermarkBitmap: ImageBitmap | null = null;

const sharedPipeline = Pipeline.create();
const videoProcessor = new VideoProcessor();
const videoSupported = VideoProcessor.isSupported();

const PRESET_FILTER_TAGS: Record<PresetName, readonly string[]> = {
  'forum-post': ['orient', 'resize', 'unsharpMask', 'encode'],
  'ecommerce-thumbnail': ['orient', 'resize', 'unsharpMask', 'encode'],
  'blog-hero': ['orient', 'resize', 'saturation', 'unsharpMask', 'encode'],
  avatar: ['orient', 'resize', 'unsharpMask', 'encode'],
};

void boot();

async function boot(): Promise<void> {
  renderPresetGrid();
  renderFilterTags();
  bindUi();
  updateVideoPanel();

  const supported = await isWebGPUSupported();
  if (!supported) {
    setStatus(
      'WebGPU is not available in this browser. Try Chrome 121+, Edge 121+, Safari 26+, or Firefox 141+.',
      'error',
    );
    runBtn.disabled = true;
    return;
  }
  setStatus('WebGPU ready · drop images or videos to start', 'ok');

  // Surface the GPU vendor/architecture so users can correlate perf with
  // their hardware. Adapter info is best-effort — older browsers omit it.
  try {
    const acquired = await acquireDevice();
    const info = await acquired.adapter.requestAdapterInfo?.();
    if (info?.vendor || info?.architecture) {
      const desc = [info.vendor, info.architecture, info.description]
        .filter(Boolean)
        .join(' · ');
      deviceStatusEl.textContent = `GPU: ${desc || 'unknown'}`;
      deviceStatusEl.classList.add('ok');
    }
  } catch {
    /* adapter info is optional */
  }

  const avif = await isAvifEncodingSupported();
  avifStatusEl.textContent = avif
    ? 'AVIF encoding supported'
    : 'AVIF unsupported · falls back to WebP';
  avifStatusEl.classList.add(avif ? 'ok' : 'warn');

  if (!videoSupported) {
    log('Video features disabled: WebCodecs APIs are unavailable in this browser.');
    videoHintEl.textContent = 'Video frame extraction requires browser WebCodecs support.';
  }
}

function renderPresetGrid(): void {
  presetGrid.replaceChildren();
  for (const preset of Object.values(PRESETS)) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'preset-tile';
    tile.dataset.preset = preset.name;
    if (preset.name === activePreset) tile.classList.add('active');
    tile.innerHTML = `
      <span class="name">${escapeHtml(preset.label)}</span>
      <span class="desc">${escapeHtml(preset.description)}</span>
    `;
    tile.addEventListener('click', () => {
      activePreset = preset.name;
      for (const t of presetGrid.querySelectorAll('.preset-tile')) {
        t.classList.toggle('active', t === tile);
      }
      renderFilterTags();
    });
    presetGrid.appendChild(tile);
  }
}

function bindUi(): void {
  concurrencyInput.addEventListener('input', () => {
    concurrencyOut.value = concurrencyInput.value;
  });
  watermarkToggle.addEventListener('input', renderFilterTags);

  browseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });
  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });
  fileInput.addEventListener('change', () => {
    const files = Array.from(fileInput.files ?? []);
    if (files.length > 0) handleIncomingFiles(files);
    fileInput.value = '';
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('drag');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag');
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length > 0) handleIncomingFiles(files);
  });

  videoExtractBtn.addEventListener('click', () => void extractVideoFrames());
  videoThumbsBtn.addEventListener('click', () => void extractVideoThumbnails());
  runBtn.addEventListener('click', () => void runBatch());
  cancelBtn.addEventListener('click', () => abort?.abort());
  clearBtn.addEventListener('click', clearAll);
  zipBtn.addEventListener('click', () => void downloadZip());
  smokePixelateBtn.addEventListener('click', () => void runSmoke('pixelate'));
  smokeRegionBlurBtn.addEventListener('click', () => void runSmoke('regionBlur'));
  smokeResetBtn.addEventListener('click', resetSmoke);
}

function resetSmoke(): void {
  if (smokePreviewUrl) {
    URL.revokeObjectURL(smokePreviewUrl);
    smokePreviewUrl = null;
  }
  smokePreviewImg.removeAttribute('src');
  smokeResultEl.hidden = true;
  smokeStatusEl.textContent = '';
}

async function runSmoke(kind: 'pixelate' | 'regionBlur'): Promise<void> {
  const slot = slots.find((s) => s.status === 'pending') ?? slots[0];
  if (!slot) {
    smokeStatusEl.textContent = 'Drop an image first.';
    return;
  }
  smokeStatusEl.textContent = `Running ${kind}…`;
  smokePixelateBtn.disabled = true;
  smokeRegionBlurBtn.disabled = true;
  try {
    const bitmap = await createImageBitmap(slot.file);
    const region = {
      x: Math.round(bitmap.width * 0.3),
      y: Math.round(bitmap.height * 0.3),
      w: Math.round(bitmap.width * 0.4),
      h: Math.round(bitmap.height * 0.4),
    };
    const p = Pipeline.create();
    if (kind === 'pixelate') {
      p.pixelate({ regions: [region], blockSize: 24 });
    } else {
      p.regionBlur({ regions: [region], sigma: 12 });
    }
    p.encode({ format: 'image/png', quality: 1 });
    const result = await p.run(bitmap);
    bitmap.close();

    if (smokePreviewUrl) URL.revokeObjectURL(smokePreviewUrl);
    smokePreviewUrl = URL.createObjectURL(result.blob);
    smokePreviewImg.src = smokePreviewUrl;
    smokeResultEl.hidden = false;
    smokeStatusEl.textContent = `${kind} done · ${result.stats.durationMs.toFixed(1)} ms`;
    log(`Smoke ${kind} · ${slot.file.name} · ${result.stats.durationMs.toFixed(1)} ms`);
  } catch (err) {
    const msg = err instanceof PixflowError ? `[${err.code}] ${err.message}` : String(err);
    smokeStatusEl.textContent = `Error: ${msg}`;
    log(`Smoke ${kind} failed: ${msg}`);
  } finally {
    smokePixelateBtn.disabled = false;
    smokeRegionBlurBtn.disabled = false;
  }
}

function addFiles(files: File[]): void {
  for (const file of files) {
    const slot: Slot = {
      file,
      status: 'pending',
      inputUrl: URL.createObjectURL(file),
    };
    slots.push(slot);
    renderCard(slot);
  }
  refreshButtons();
  log(`Loaded ${String(files.length)} file(s) · queue total ${String(slots.length)}`);
}

function handleIncomingFiles(files: File[]): void {
  const imageFiles = files.filter((f) => f.type.startsWith('image/'));
  const videoFiles = files.filter((f) => f.type.startsWith('video/'));
  if (imageFiles.length > 0) addFiles(imageFiles);
  if (videoFiles.length > 0) {
    pendingVideo = videoFiles[0] ?? null;
    if (videoFiles.length > 1) {
      log(`Detected ${String(videoFiles.length)} videos; using ${videoFiles[0]?.name ?? 'first file'}.`);
    }
    updateVideoPanel();
  }
}

function renderFilterTags(): void {
  const tags = [...(PRESET_FILTER_TAGS[activePreset] ?? [])];
  if (watermarkToggle.checked) tags.push('watermark');
  filterTags.replaceChildren();
  for (const name of tags) {
    const tag = document.createElement('span');
    tag.className = `filter-tag${name === 'watermark' ? ' active' : ''}`;
    tag.textContent = name;
    filterTags.appendChild(tag);
  }
}

function updateVideoPanel(): void {
  videoPanel.hidden = pendingVideo === null;
  if (!pendingVideo) return;
  videoNameEl.textContent = pendingVideo.name;
  if (videoSupported) {
    videoExtractBtn.disabled = false;
    videoThumbsBtn.disabled = false;
    videoHintEl.textContent = 'Extract frames from video and process them with the selected preset.';
  } else {
    videoExtractBtn.disabled = true;
    videoThumbsBtn.disabled = true;
    videoHintEl.textContent = 'Video features are unavailable in this browser (WebCodecs not supported).';
  }
}

function refreshButtons(): void {
  const pending = slots.some((s) => s.status === 'pending');
  const done = slots.some((s) => s.status === 'done');
  runBtn.disabled = !pending || abort !== null;
  cancelBtn.disabled = abort === null;
  zipBtn.disabled = !done;
  clearBtn.disabled = slots.length === 0 || abort !== null;
}

function clearAll(): void {
  for (const s of slots) {
    s.card?.remove();
    if (s.outputUrl) URL.revokeObjectURL(s.outputUrl);
  }
  slots = [];
  pendingVideo = null;
  updateVideoPanel();
  progressPanel.hidden = true;
  benchPanel.hidden = true;
  resetSmoke();
  refreshButtons();
}

async function runBatch(): Promise<void> {
  const toRun = slots.filter((s) => s.status === 'pending');
  if (toRun.length === 0) return;

  const preset = PRESETS[activePreset];
  if (!preset) return;

  sharedPipeline.reset();
  preset.apply(sharedPipeline);
  if (watermarkToggle.checked) {
    try {
      sharedPipeline.watermark({
        image: await getWatermarkBitmap(),
        position: 'bottom-right',
        opacity: 0.3,
        scale: 0.15,
      });
    } catch (err) {
      const msg = err instanceof PixflowError ? `[${err.code}] ${err.message}` : String(err);
      log(`Watermark setup failed: ${msg}`);
      setStatus('Could not create watermark image. See log for details.', 'warn');
      return;
    }
  }

  abort = new AbortController();
  refreshButtons();
  progressPanel.hidden = false;
  updateProgress(0, toRun.length);

  const concurrency = Math.max(
    1,
    Math.min(8, parseInt(concurrencyInput.value, 10) || 4),
  );
  const sources = toRun.map((s) => s.file);
  for (const s of toRun) s.status = 'running';
  toRun.forEach(renderCard);

  const start = performance.now();
  let pixflowMs = 0;
  let succeeded = 0;
  try {
    await sharedPipeline.batch(sources, {
      concurrency,
      signal: abort.signal,
      onProgress: (done, total, result, index) => {
        updateProgress(done, total);
        const slot = toRun[index];
        if (!slot) return;
        slot.status = 'done';
        slot.result = result;
        succeeded++;
        void finalizeSlot(slot);
      },
    });
    pixflowMs = performance.now() - start;
    log(
      `pixflow batch · ${String(toRun.length)} image(s) in ${pixflowMs.toFixed(1)} ms` +
        ` (avg ${(pixflowMs / toRun.length).toFixed(1)} ms/image, concurrency=${String(concurrency)})`,
    );
  } catch (err) {
    const msg = err instanceof PixflowError ? `[${err.code}] ${err.message}` : String(err);
    for (const s of toRun) {
      if (s.status === 'running') {
        s.status = 'error';
        s.error = msg;
        renderCard(s);
      }
    }
    log(`Batch error: ${msg}`);
    abort = null;
    refreshButtons();
    return;
  }

  abort = null;
  refreshButtons();

  if (benchToggle.checked && succeeded > 0) {
    await runCanvasBenchmark(toRun, preset, pixflowMs);
  } else {
    benchPanel.hidden = true;
  }
}

async function runCanvasBenchmark(
  toRun: readonly Slot[],
  preset: PresetSpec,
  pixflowMs: number,
): Promise<void> {
  benchPanel.hidden = false;
  benchPixflowValue.textContent = `${pixflowMs.toFixed(0)} ms`;
  benchCanvasValue.textContent = 'measuring…';
  benchSummary.textContent = `Running a Canvas2D baseline that matches the selected preset as closely as possible…`;
  benchPixflowFill.style.width = '0%';
  benchCanvasFill.style.width = '0%';

  const start = performance.now();
  let totalBytes = 0;
  for (const slot of toRun) {
    try {
      if (!slot.result) continue;
      const out = await canvasPipeline(slot, preset, {
        watermark: watermarkToggle.checked,
      });
      totalBytes += out.size;
    } catch (err) {
      log(`Canvas2D fallback failed on ${slot.file.name}: ${String(err)}`);
    }
  }
  const canvasMs = performance.now() - start;

  const max = Math.max(pixflowMs, canvasMs, 1);
  benchPixflowFill.style.width = `${((pixflowMs / max) * 100).toFixed(1)}%`;
  benchCanvasFill.style.width = `${((canvasMs / max) * 100).toFixed(1)}%`;
  benchPixflowValue.textContent = `${pixflowMs.toFixed(0)} ms`;
  benchCanvasValue.textContent = `${canvasMs.toFixed(0)} ms`;

  const speedup = canvasMs / Math.max(pixflowMs, 0.001);
  const verb = speedup >= 1 ? 'faster' : 'slower';
  const ratio =
    speedup >= 1 ? speedup.toFixed(1) : (1 / speedup).toFixed(1);
  benchSummary.innerHTML =
    `pixflow is <strong>${ratio}× ${verb}</strong> than the matched Canvas2D baseline ` +
    `(${String(toRun.length)} image(s), ${(totalBytes / 1024 / 1024).toFixed(1)} MB Canvas2D output).`;
}

interface CanvasRecipe {
  readonly width: number;
  readonly height: number;
  readonly fit: 'cover' | 'contain';
  readonly format: string;
  readonly quality: number;
  readonly saturation?: number;
  readonly unsharp?: {
    readonly amount: number;
    readonly threshold: number;
  };
}

interface CanvasBenchmarkOptions {
  readonly watermark: boolean;
}

function canvasRecipeForSlot(slot: Slot, name: PresetName): CanvasRecipe {
  const result = slot.result;
  if (!result) {
    throw new Error(`Missing pixflow result for ${slot.file.name}`);
  }
  switch (name) {
    case 'avatar':
      return {
        width: result.width,
        height: result.height,
        fit: 'cover',
        format: result.stats.format,
        quality: 0.8,
        unsharp: { amount: 0.4, threshold: 0 },
      };
    case 'ecommerce-thumbnail':
      return {
        width: result.width,
        height: result.height,
        fit: 'cover',
        format: result.stats.format,
        quality: 0.7,
        unsharp: { amount: 0.5, threshold: 0 },
      };
    case 'blog-hero':
      return {
        width: result.width,
        height: result.height,
        fit: 'cover',
        format: result.stats.format,
        quality: 0.85,
        saturation: 0.1,
        unsharp: { amount: 0.25, threshold: 0 },
      };
    case 'forum-post':
    default:
      return {
        width: result.width,
        height: result.height,
        fit: 'contain',
        format: result.stats.format,
        quality: 0.82,
        unsharp: { amount: 0.3, threshold: 0 },
      };
  }
}

async function canvasPipeline(
  slot: Slot,
  preset: PresetSpec,
  options: CanvasBenchmarkOptions,
): Promise<Blob> {
  const recipe = canvasRecipeForSlot(slot, preset.name);
  const bitmap = await createImageBitmap(slot.file);
  const { width: srcW, height: srcH } = bitmap;
  const canvas = document.createElement('canvas');
  canvas.width = recipe.width;
  canvas.height = recipe.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, recipe.width, recipe.height);
  if (recipe.fit === 'cover') {
    const ratio = Math.max(recipe.width / srcW, recipe.height / srcH);
    const drawW = srcW * ratio;
    const drawH = srcH * ratio;
    ctx.drawImage(
      bitmap,
      (recipe.width - drawW) / 2,
      (recipe.height - drawH) / 2,
      drawW,
      drawH,
    );
  } else {
    const ratio = Math.min(recipe.width / srcW, recipe.height / srcH);
    const drawW = srcW * ratio;
    const drawH = srcH * ratio;
    ctx.drawImage(
      bitmap,
      (recipe.width - drawW) / 2,
      (recipe.height - drawH) / 2,
      drawW,
      drawH,
    );
  }
  bitmap.close();

  if (recipe.saturation !== undefined || recipe.unsharp) {
    const image = ctx.getImageData(0, 0, recipe.width, recipe.height);
    if (recipe.saturation !== undefined) {
      applySaturation(image.data, recipe.saturation);
    }
    if (recipe.unsharp) {
      applyUnsharpMask(image.data, recipe.width, recipe.height, recipe.unsharp);
    }
    ctx.putImageData(image, 0, 0);
  }

  if (options.watermark) {
    await drawCanvasWatermark(ctx, recipe.width, recipe.height);
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
      recipe.format,
      recipe.quality,
    );
  });
}

function applySaturation(data: Uint8ClampedArray, amount: number): void {
  const multiplier = 1 + amount;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    data[i] = clampByte(gray + (r - gray) * multiplier);
    data[i + 1] = clampByte(gray + (g - gray) * multiplier);
    data[i + 2] = clampByte(gray + (b - gray) * multiplier);
  }
}

function applyUnsharpMask(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  params: { amount: number; threshold: number },
): void {
  const original = new Uint8ClampedArray(data);
  const blurred = blurRgba(original, width, height);
  const threshold = params.threshold * 255;
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const orig = original[i + c] ?? 0;
      const blur = blurred[i + c] ?? 0;
      const diff = orig - blur;
      if (Math.abs(diff) < threshold) {
        data[i + c] = orig;
        continue;
      }
      data[i + c] = clampByte(orig + diff * params.amount);
    }
    data[i + 3] = original[i + 3] ?? 255;
  }
}

function blurRgba(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data.length);
  const kernel = [
    [1, 2, 1],
    [2, 4, 2],
    [1, 2, 1],
  ];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let weightSum = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const sx = Math.min(width - 1, Math.max(0, x + kx));
          const sy = Math.min(height - 1, Math.max(0, y + ky));
          const weight = kernel[ky + 1]?.[kx + 1] ?? 0;
          const idx = (sy * width + sx) * 4;
          r += (data[idx] ?? 0) * weight;
          g += (data[idx + 1] ?? 0) * weight;
          b += (data[idx + 2] ?? 0) * weight;
          a += (data[idx + 3] ?? 0) * weight;
          weightSum += weight;
        }
      }
      const outIdx = (y * width + x) * 4;
      out[outIdx] = clampByte(r / weightSum);
      out[outIdx + 1] = clampByte(g / weightSum);
      out[outIdx + 2] = clampByte(b / weightSum);
      out[outIdx + 3] = clampByte(a / weightSum);
    }
  }
  return out;
}

async function drawCanvasWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): Promise<void> {
  const watermark = await getWatermarkBitmap();
  const scale = 0.15;
  const margin = 16;
  const drawWidth = Math.max(1, Math.round(width * scale));
  const drawHeight = Math.max(1, Math.round((drawWidth * watermark.height) / watermark.width));
  const x = Math.max(0, width - drawWidth - margin);
  const y = Math.max(0, height - drawHeight - margin);
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.drawImage(watermark, x, y, drawWidth, drawHeight);
  ctx.restore();
}

function clampByte(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

async function finalizeSlot(slot: Slot): Promise<void> {
  renderCard(slot);
  if (!slot.result || !slot.outputImage) return;
  try {
    if (slot.outputUrl) URL.revokeObjectURL(slot.outputUrl);
    slot.outputUrl = URL.createObjectURL(slot.result.blob);
    slot.outputImage.src = slot.outputUrl;
    await slot.outputImage.decode();
  } catch (err) {
    slot.status = 'error';
    slot.error = `Failed to decode output blob: ${String(err)}`;
    renderCard(slot);
    log(`Failed to decode pixflow output for ${slot.file.name}: ${String(err)}`);
  }
}

function renderCard(slot: Slot): void {
  if (!slot.card) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="compare">
        <span class="badge left">before</span>
        <span class="badge right">after</span>
        <img class="preview-image input-image" alt="Original preview" />
        <div class="output-canvas-wrapper">
          <img class="preview-image output-image" alt="Processed preview" />
        </div>
        <div class="slider-handle" role="slider" aria-label="Compare slider"></div>
      </div>
      <div class="card-body">
        <div class="card-title"></div>
        <div class="card-meta"></div>
        <div class="card-actions">
          <button class="download" type="button" disabled>Download</button>
          <button class="remove" type="button">Remove</button>
        </div>
      </div>
    `;
    slot.card = card;
    slot.inputImage = card.querySelector<HTMLImageElement>('.input-image') ?? undefined;
    slot.outputImage = card.querySelector<HTMLImageElement>('.output-image') ?? undefined;
    card.querySelector('.download')?.addEventListener('click', () => downloadSlot(slot));
    card.querySelector('.remove')?.addEventListener('click', () => removeSlot(slot));
    setupCompareSlider(card);
    resultsEl.appendChild(card);
  }
  const card = slot.card;
  const title = card.querySelector<HTMLDivElement>('.card-title');
  const meta = card.querySelector<HTMLDivElement>('.card-meta');
  const download = card.querySelector<HTMLButtonElement>('.download');
  if (title) title.textContent = slot.file.name;
  if (slot.inputImage && slot.inputUrl && slot.inputImage.src !== slot.inputUrl) {
    slot.inputImage.src = slot.inputUrl;
  }
  if (slot.outputImage) {
    slot.outputImage.src = slot.outputUrl ?? '';
  }
  card.classList.toggle('error', slot.status === 'error');
  if (meta) meta.textContent = metaText(slot);
  if (download) download.disabled = slot.status !== 'done';
}

function setupCompareSlider(card: HTMLDivElement): void {
  const compare = card.querySelector<HTMLDivElement>('.compare');
  const wrapper = card.querySelector<HTMLDivElement>('.output-canvas-wrapper');
  const handle = card.querySelector<HTMLDivElement>('.slider-handle');
  if (!compare || !wrapper || !handle) return;

  let dragging = false;

  function setSplit(pctRaw: number): void {
    const pct = Math.min(100, Math.max(0, pctRaw));
    compare.style.setProperty('--split', `${pct.toString()}%`);
    if (handle) handle.style.left = `${pct.toString()}%`;
  }

  function onPointer(e: PointerEvent): void {
    if (!dragging || !compare) return;
    const rect = compare.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    setSplit(pct);
  }

  handle.addEventListener('pointerdown', (e) => {
    dragging = true;
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener('pointermove', onPointer);
  handle.addEventListener('pointerup', (e) => {
    dragging = false;
    handle.releasePointerCapture(e.pointerId);
  });
  // Click anywhere in the compare frame to jump the slider there.
  compare.addEventListener('click', (e) => {
    if (e.target === handle) return;
    const rect = compare.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    setSplit(pct);
  });

  setSplit(50);
}

function metaText(slot: Slot): string {
  if (slot.status === 'pending') return `queued · ${formatBytes(slot.file.size)}`;
  if (slot.status === 'running') return `processing…`;
  if (slot.status === 'error') return slot.error ?? 'error';
  const r = slot.result;
  if (!r) return '';
  const ratio = r.blob.size / slot.file.size;
  const fallback = r.stats.requestedFormat
    ? ` (fallback from ${prettyFormat(r.stats.requestedFormat)})`
    : '';
  return [
    `${String(r.stats.inputWidth)}×${String(r.stats.inputHeight)} → ${String(r.width)}×${String(r.height)}`,
    `${prettyFormat(r.stats.format)}${fallback} · ${formatBytes(r.blob.size)} (${formatPercent(ratio * 100)} of source)`,
    `${r.stats.durationMs.toFixed(1)} ms · pool ${String(r.stats.poolReuses)} reuses / ${String(r.stats.poolAllocations)} allocs`,
  ].join('\n');
}

function prettyFormat(format: string): string {
  return format.replace('image/', '').toUpperCase();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0%';
  if (value < 0.1) return '<0.1%';
  if (value < 1) return `${value.toFixed(1)}%`;
  return `${value.toFixed(0)}%`;
}

function removeSlot(slot: Slot): void {
  const idx = slots.indexOf(slot);
  if (idx >= 0) slots.splice(idx, 1);
  if (slot.inputUrl) URL.revokeObjectURL(slot.inputUrl);
  if (slot.outputUrl) URL.revokeObjectURL(slot.outputUrl);
  slot.card?.remove();
  refreshButtons();
}

function downloadSlot(slot: Slot): void {
  if (!slot.result) return;
  const url = URL.createObjectURL(slot.result.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = outputName(slot);
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

async function downloadZip(): Promise<void> {
  const done = slots.filter((s) => s.status === 'done' && s.result);
  if (done.length === 0) return;
  const files = done.map((s) => ({ name: outputName(s), blob: s.result!.blob }));
  const zip = await buildZip(files);
  const url = URL.createObjectURL(zip);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pixflow-${activePreset}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  log(`ZIP · ${String(done.length)} file(s) · ${formatBytes(zip.size)}`);
}

async function extractVideoFrames(): Promise<void> {
  if (!pendingVideo) return;
  if (!videoSupported) {
    log('Video extraction unavailable: browser does not expose required WebCodecs APIs.');
    return;
  }
  videoExtractBtn.disabled = true;
  videoThumbsBtn.disabled = true;
  try {
    const frames = await videoProcessor.extractFrames(pendingVideo, {
      intervalMs: 1000,
      maxFrames: 12,
    });
    const files = await extractedFramesToFiles(pendingVideo, frames, 'frame');
    if (files.length > 0) addFiles(files);
    log(`Video frames extracted · ${String(files.length)} image(s) from ${pendingVideo.name}`);
  } catch (err) {
    const msg = err instanceof PixflowError ? `[${err.code}] ${err.message}` : String(err);
    log(`Video frame extraction failed: ${msg}`);
  } finally {
    updateVideoPanel();
  }
}

async function extractVideoThumbnails(): Promise<void> {
  if (!pendingVideo) return;
  if (!videoSupported) {
    log('Video thumbnails unavailable: browser does not expose required WebCodecs APIs.');
    return;
  }
  videoExtractBtn.disabled = true;
  videoThumbsBtn.disabled = true;
  try {
    const thumbs = await videoProcessor.generateThumbnails(pendingVideo, { count: 8, width: 640 });
    const base = pendingVideo.name.replace(/\.[^.]+$/, '');
    const files = thumbs.map((blob, i) => {
      const n = String(i + 1).padStart(3, '0');
      return new File([blob], `${base}.thumb-${n}.webp`, { type: blob.type || 'image/webp' });
    });
    addFiles(files);
    log(`Auto thumbnails extracted · ${String(files.length)} image(s) from ${pendingVideo.name}`);
  } catch (err) {
    const msg = err instanceof PixflowError ? `[${err.code}] ${err.message}` : String(err);
    log(`Video thumbnail extraction failed: ${msg}`);
  } finally {
    updateVideoPanel();
  }
}

async function extractedFramesToFiles(
  sourceVideo: File,
  frames: readonly { timestamp: number; bitmap: ImageBitmap }[],
  kind: 'frame' | 'thumb',
): Promise<File[]> {
  const base = sourceVideo.name.replace(/\.[^.]+$/, '');
  const out: File[] = [];
  for (const [i, frame] of frames.entries()) {
    try {
      const blob = await bitmapToWebp(frame.bitmap);
      const n = String(i + 1).padStart(3, '0');
      out.push(
        new File([blob], `${base}.${kind}-${n}.${String(frame.timestamp)}ms.webp`, {
          type: blob.type || 'image/webp',
        }),
      );
    } finally {
      frame.bitmap.close();
    }
  }
  return out;
}

async function bitmapToWebp(bitmap: ImageBitmap): Promise<Blob> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(bitmap, 0, 0);
    return canvas.convertToBlob({ type: 'image/webp', quality: 0.88 });
  }
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.drawImage(bitmap, 0, 0);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob returned null'))),
      'image/webp',
      0.88,
    );
  });
}

async function getWatermarkBitmap(): Promise<ImageBitmap> {
  if (watermarkBitmap) return watermarkBitmap;
  if (typeof OffscreenCanvas === 'undefined') {
    throw new Error('OffscreenCanvas is not available');
  }
  const width = 256;
  const height = 96;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(10, 20, width - 20, height - 32);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 40px ui-monospace, monospace';
  ctx.fillText('pixflow', width / 2, height / 2 + 2);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  watermarkBitmap = await createImageBitmap(blob);
  return watermarkBitmap;
}

function outputName(slot: Slot): string {
  const base = slot.file.name.replace(/\.[^.]+$/, '');
  const ext = extForFormat(slot.result?.stats.format);
  return `${base}.pixflow.${ext}`;
}

function extForFormat(format: string | undefined): string {
  switch (format) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/avif':
      return 'avif';
    default:
      return 'png';
  }
}

function updateProgress(done: number, total: number): void {
  const pct = total === 0 ? 0 : (done / total) * 100;
  progressFill.style.width = `${pct.toFixed(1)}%`;
  progressLabel.textContent = `${String(done)} / ${String(total)}`;
}


function setStatus(message: string, tone: 'ok' | 'error' | 'warn' | 'neutral' = 'neutral'): void {
  statusEl.textContent = message;
  statusEl.classList.remove('ok', 'error', 'warn');
  if (tone !== 'neutral') statusEl.classList.add(tone);
}

function log(message: string): void {
  const timestamp = new Date().toLocaleTimeString();
  logEl.textContent = `[${timestamp}] ${message}\n${logEl.textContent ?? ''}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

function qs<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return el;
}
