import {
  isAvifEncodingSupported,
  isWebGPUSupported,
  Pipeline,
  PixflowError,
  PRESETS,
  type PipelineResult,
  type PresetName,
} from 'pixflow';
import { buildZip } from './zip.js';

const statusEl = qs<HTMLDivElement>('#status');
const avifStatusEl = qs<HTMLDivElement>('#avif-status');
const presetSelect = qs<HTMLSelectElement>('#preset');
const presetDesc = qs<HTMLSpanElement>('#preset-description');
const dropzone = qs<HTMLDivElement>('#dropzone');
const fileInput = qs<HTMLInputElement>('#file-input');
const browseBtn = qs<HTMLButtonElement>('#browse');
const concurrencyInput = qs<HTMLInputElement>('#concurrency');
const concurrencyOut = qs<HTMLOutputElement>('#concurrency-value');
const runBtn = qs<HTMLButtonElement>('#run');
const cancelBtn = qs<HTMLButtonElement>('#cancel');
const zipBtn = qs<HTMLButtonElement>('#download-zip');
const clearBtn = qs<HTMLButtonElement>('#clear');
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
  outputCanvas?: HTMLCanvasElement;
  outputUrl?: string;
}

let slots: Slot[] = [];
let abort: AbortController | null = null;

const sharedPipeline = Pipeline.create();

(async () => {
  const supported = await isWebGPUSupported();
  if (!supported) {
    setStatus('WebGPU is not available in this browser. Try Chrome 121+ or Safari 26+.', 'error');
    return;
  }
  setStatus('WebGPU ready. Drop images to start.', 'ok');
  const avif = await isAvifEncodingSupported();
  avifStatusEl.textContent = avif
    ? 'AVIF encoding: supported'
    : 'AVIF encoding: not supported (WebP fallback)';
  avifStatusEl.classList.toggle('ok', avif);
})();

setPresetDescription();
presetSelect.addEventListener('change', setPresetDescription);

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
  const files = Array.from(e.dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/'));
  if (files.length > 0) addFiles(files);
});

runBtn.addEventListener('click', runBatch);
cancelBtn.addEventListener('click', () => abort?.abort());
clearBtn.addEventListener('click', clearAll);
zipBtn.addEventListener('click', downloadZip);

function setPresetDescription(): void {
  const preset = PRESETS[presetSelect.value as PresetName];
  presetDesc.textContent = preset?.description ?? '';
}

function addFiles(files: File[]): void {
  for (const file of files) {
    const slot: Slot = { file, status: 'pending' };
    slots.push(slot);
    renderCard(slot);
    void drawInput(slot);
  }
  refreshButtons();
  log(`Loaded ${String(files.length)} file(s). Total queue: ${String(slots.length)}.`);
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
  refreshButtons();
}

async function runBatch(): Promise<void> {
  const toRun = slots.filter((s) => s.status === 'pending');
  if (toRun.length === 0) return;

  const preset = PRESETS[presetSelect.value as PresetName];
  if (!preset) return;

  sharedPipeline.reset();
  preset.apply(sharedPipeline);

  abort = new AbortController();
  refreshButtons();
  progressPanel.hidden = false;
  updateProgress(0, toRun.length);

  const concurrency = Math.max(1, Math.min(8, parseInt(concurrencyInput.value, 10) || 4));
  const start = performance.now();

  // Map slot -> index-in-toRun so batch results can be routed back.
  const sources = toRun.map((s) => s.file);
  for (const s of toRun) s.status = 'running';
  slots.forEach(renderCard);

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
        void finalizeSlot(slot);
      },
    });
    const elapsed = performance.now() - start;
    const perImage = (elapsed / toRun.length).toFixed(1);
    log(
      `Batch: ${String(toRun.length)} image(s) in ${elapsed.toFixed(1)} ms` +
        ` (avg ${perImage} ms/image, concurrency=${String(concurrency)})`,
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
  } finally {
    abort = null;
    refreshButtons();
  }
}

async function finalizeSlot(slot: Slot): Promise<void> {
  renderCard(slot);
  if (!slot.result || !slot.outputCanvas) return;
  const bitmap = await createImageBitmap(slot.result.blob);
  slot.outputCanvas.width = bitmap.width;
  slot.outputCanvas.height = bitmap.height;
  const ctx = slot.outputCanvas.getContext('2d');
  ctx?.drawImage(bitmap, 0, 0);
  bitmap.close();
}

async function drawInput(slot: Slot): Promise<void> {
  const canvas = slot.card?.querySelector<HTMLCanvasElement>('.input-canvas');
  if (!canvas) return;
  try {
    const bitmap = await createImageBitmap(slot.file);
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
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
      <div class="card-compare">
        <figure>
          <canvas class="input-canvas"></canvas>
          <figcaption>input</figcaption>
        </figure>
        <figure>
          <canvas class="output-canvas"></canvas>
          <figcaption>output</figcaption>
        </figure>
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
    slot.outputCanvas = card.querySelector<HTMLCanvasElement>('.output-canvas') ?? undefined;
    card.querySelector('.download')?.addEventListener('click', () => downloadSlot(slot));
    card.querySelector('.remove')?.addEventListener('click', () => removeSlot(slot));
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
    `${prettyFormat(r.stats.format)}${fallback} · ${formatBytes(r.blob.size)} (${(ratio * 100).toFixed(0)}% of original)`,
    `${r.stats.durationMs.toFixed(1)} ms · pool alloc ${String(r.stats.poolAllocations)}, reuse ${String(r.stats.poolReuses)}`,
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
  a.download = `pixflow-${presetSelect.value}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  log(`ZIP: ${String(done.length)} file(s), ${formatBytes(zip.size)}`);
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

function setStatus(message: string, tone: 'ok' | 'error' | 'neutral' = 'neutral'): void {
  statusEl.textContent = message;
  statusEl.classList.remove('ok', 'error');
  if (tone === 'ok') statusEl.classList.add('ok');
  if (tone === 'error') statusEl.classList.add('error');
}

function log(message: string): void {
  const timestamp = new Date().toLocaleTimeString();
  logEl.textContent = `[${timestamp}] ${message}\n${logEl.textContent ?? ''}`;
}

function qs<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return el;
}
