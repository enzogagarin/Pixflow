import {
  acquireDevice,
  isAvifEncodingSupported,
  isWebGPUSupported,
  Pipeline,
  PixflowError,
  PRESETS,
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
const benchToggle = qs<HTMLInputElement>('#bench-toggle');
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

interface Slot {
  readonly file: File;
  status: 'pending' | 'running' | 'done' | 'error';
  result?: PipelineResult;
  error?: string;
  card?: HTMLDivElement;
  inputCanvas?: HTMLCanvasElement;
  outputCanvas?: HTMLCanvasElement;
  outputUrl?: string;
}

let slots: Slot[] = [];
let abort: AbortController | null = null;
let activePreset: PresetName = 'forum-post';

const sharedPipeline = Pipeline.create();

void boot();

async function boot(): Promise<void> {
  renderPresetGrid();
  bindUi();

  const supported = await isWebGPUSupported();
  if (!supported) {
    setStatus(
      'WebGPU is not available in this browser. Try Chrome 121+, Edge 121+, Safari 26+, or Firefox 141+.',
      'error',
    );
    runBtn.disabled = true;
    return;
  }
  setStatus('WebGPU ready · drop images to start', 'ok');

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
    });
    presetGrid.appendChild(tile);
  }
}

function bindUi(): void {
  concurrencyInput.addEventListener('input', () => {
    concurrencyOut.value = concurrencyInput.value;
  });

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
    if (files.length > 0) addFiles(files);
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
    const files = Array.from(e.dataTransfer?.files ?? []).filter((f) =>
      f.type.startsWith('image/'),
    );
    if (files.length > 0) addFiles(files);
  });

  runBtn.addEventListener('click', () => void runBatch());
  cancelBtn.addEventListener('click', () => abort?.abort());
  clearBtn.addEventListener('click', clearAll);
  zipBtn.addEventListener('click', () => void downloadZip());
}

function addFiles(files: File[]): void {
  for (const file of files) {
    const slot: Slot = { file, status: 'pending' };
    slots.push(slot);
    renderCard(slot);
    void drawInput(slot);
  }
  refreshButtons();
  log(`Loaded ${String(files.length)} file(s) · queue total ${String(slots.length)}`);
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
  progressPanel.hidden = true;
  benchPanel.hidden = true;
  refreshButtons();
}

async function runBatch(): Promise<void> {
  const toRun = slots.filter((s) => s.status === 'pending');
  if (toRun.length === 0) return;

  const preset = PRESETS[activePreset];
  if (!preset) return;

  sharedPipeline.reset();
  preset.apply(sharedPipeline);

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
  benchSummary.textContent = `Running the same workload through HTMLCanvasElement.drawImage + toBlob…`;
  benchPixflowFill.style.width = '0%';
  benchCanvasFill.style.width = '0%';

  const target = canvasTargetForPreset(preset.name);
  const start = performance.now();
  let totalBytes = 0;
  for (const slot of toRun) {
    try {
      const out = await canvasPipeline(slot.file, target);
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
    `pixflow is <strong>${ratio}× ${verb}</strong> than Canvas2D for this workload ` +
    `(${String(toRun.length)} image(s), ${(totalBytes / 1024 / 1024).toFixed(1)} MB Canvas2D output).`;
}

interface CanvasTarget {
  readonly width: number;
  readonly height: number;
  readonly fit: 'cover' | 'contain';
  readonly type: string;
  readonly quality: number;
}

function canvasTargetForPreset(name: PresetName): CanvasTarget {
  switch (name) {
    case 'avatar':
      return { width: 256, height: 256, fit: 'cover', type: 'image/webp', quality: 0.8 };
    case 'ecommerce-thumbnail':
      return { width: 600, height: 600, fit: 'cover', type: 'image/webp', quality: 0.7 };
    case 'blog-hero':
      return { width: 1600, height: 900, fit: 'cover', type: 'image/webp', quality: 0.85 };
    case 'forum-post':
    default:
      return { width: 1200, height: 1200, fit: 'contain', type: 'image/webp', quality: 0.82 };
  }
}

async function canvasPipeline(file: File, target: CanvasTarget): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const { width: srcW, height: srcH } = bitmap;
  const dims = scaledDims(srcW, srcH, target);
  const canvas = document.createElement('canvas');
  canvas.width = dims.width;
  canvas.height = dims.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (target.fit === 'cover') {
    const ratio = Math.max(dims.width / srcW, dims.height / srcH);
    const drawW = srcW * ratio;
    const drawH = srcH * ratio;
    ctx.drawImage(
      bitmap,
      (dims.width - drawW) / 2,
      (dims.height - drawH) / 2,
      drawW,
      drawH,
    );
  } else {
    const ratio = Math.min(dims.width / srcW, dims.height / srcH);
    ctx.drawImage(bitmap, 0, 0, srcW * ratio, srcH * ratio);
  }
  bitmap.close();
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
      target.type,
      target.quality,
    );
  });
}

function scaledDims(
  srcW: number,
  srcH: number,
  target: CanvasTarget,
): { width: number; height: number } {
  if (target.fit === 'cover') {
    return { width: target.width, height: target.height };
  }
  const ratio = Math.min(target.width / srcW, target.height / srcH);
  return {
    width: Math.max(1, Math.round(srcW * ratio)),
    height: Math.max(1, Math.round(srcH * ratio)),
  };
}

async function finalizeSlot(slot: Slot): Promise<void> {
  renderCard(slot);
  if (!slot.result || !slot.outputCanvas) return;
  const bitmap = await createImageBitmap(slot.result.blob);
  // Match the visible card aspect ratio (4:3) so the slider lines up with
  // the input canvas. We render the output bitmap centered with `object-fit
  // : contain` semantics by drawing to a 4:3 backing.
  const cardW = 480;
  const cardH = 360;
  slot.outputCanvas.width = cardW;
  slot.outputCanvas.height = cardH;
  const ctx = slot.outputCanvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, cardW, cardH);
  const r = Math.min(cardW / bitmap.width, cardH / bitmap.height);
  const dw = bitmap.width * r;
  const dh = bitmap.height * r;
  ctx.drawImage(bitmap, (cardW - dw) / 2, (cardH - dh) / 2, dw, dh);
  bitmap.close();
}

async function drawInput(slot: Slot): Promise<void> {
  const canvas = slot.card?.querySelector<HTMLCanvasElement>('.input-canvas');
  if (!canvas) return;
  try {
    const bitmap = await createImageBitmap(slot.file);
    const cardW = 480;
    const cardH = 360;
    canvas.width = cardW;
    canvas.height = cardH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cardW, cardH);
    const r = Math.min(cardW / bitmap.width, cardH / bitmap.height);
    const dw = bitmap.width * r;
    const dh = bitmap.height * r;
    ctx.drawImage(bitmap, (cardW - dw) / 2, (cardH - dh) / 2, dw, dh);
    bitmap.close();
  } catch (err) {
    log(`Failed to decode ${slot.file.name}: ${String(err)}`);
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
        <canvas class="input-canvas"></canvas>
        <div class="output-canvas-wrapper">
          <canvas class="output-canvas"></canvas>
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
    slot.inputCanvas = card.querySelector<HTMLCanvasElement>('.input-canvas') ?? undefined;
    slot.outputCanvas = card.querySelector<HTMLCanvasElement>('.output-canvas') ?? undefined;
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
    if (wrapper) wrapper.style.width = `${pct.toString()}%`;
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
    `${prettyFormat(r.stats.format)}${fallback} · ${formatBytes(r.blob.size)} (${(ratio * 100).toFixed(0)}% of source)`,
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

function removeSlot(slot: Slot): void {
  const idx = slots.indexOf(slot);
  if (idx >= 0) slots.splice(idx, 1);
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
  URL.revokeObjectURL(url);
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
