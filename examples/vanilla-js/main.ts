import {
  isWebGPUSupported,
  Pipeline,
  PixflowError,
  readExifOrientation,
  type ResizeFit,
} from 'pixflow';

const statusEl = qs<HTMLDivElement>('#status');
const fileInput = qs<HTMLInputElement>('#file-input');

const resizeEnabled = qs<HTMLInputElement>('#resize-enabled');
const resizeWidth = qs<HTMLInputElement>('#resize-width');
const resizeWidthOut = qs<HTMLOutputElement>('#resize-width-value');
const resizeFit = qs<HTMLSelectElement>('#resize-fit');

const brightnessInput = qs<HTMLInputElement>('#brightness');
const brightnessOut = qs<HTMLOutputElement>('#brightness-value');
const contrastInput = qs<HTMLInputElement>('#contrast');
const contrastOut = qs<HTMLOutputElement>('#contrast-value');
const saturationInput = qs<HTMLInputElement>('#saturation');
const saturationOut = qs<HTMLOutputElement>('#saturation-value');

const blurInput = qs<HTMLInputElement>('#blur');
const blurOut = qs<HTMLOutputElement>('#blur-value');
const sharpenAmount = qs<HTMLInputElement>('#sharpen-amount');
const sharpenAmountOut = qs<HTMLOutputElement>('#sharpen-amount-value');
const sharpenRadius = qs<HTMLInputElement>('#sharpen-radius');
const sharpenRadiusOut = qs<HTMLOutputElement>('#sharpen-radius-value');

const rotateInput = qs<HTMLSelectElement>('#rotate');
const flipInput = qs<HTMLSelectElement>('#flip');
const orientInput = qs<HTMLInputElement>('#orient');

const applyBtn = qs<HTMLButtonElement>('#apply');
const batchBtn = qs<HTMLButtonElement>('#batch');
const downloadBtn = qs<HTMLButtonElement>('#download');
const inputCanvas = qs<HTMLCanvasElement>('#input-canvas');
const outputCanvas = qs<HTMLCanvasElement>('#output-canvas');
const logEl = qs<HTMLElement>('#log');

let currentFile: File | null = null;
let lastBlob: Blob | null = null;
let lastFilename = 'pixflow-output.png';
const sharedPipeline = Pipeline.create();

(async () => {
  const supported = await isWebGPUSupported();
  if (!supported) {
    setStatus('WebGPU is not available in this browser. Try Chrome 121+ or Safari 26+.', 'error');
    return;
  }
  setStatus('WebGPU ready. Upload an image to start.', 'ok');
})();

resizeWidth.addEventListener('input', () => {
  resizeWidthOut.value = resizeWidth.value;
});
brightnessInput.addEventListener('input', () => {
  brightnessOut.value = formatSigned(+brightnessInput.value);
});
contrastInput.addEventListener('input', () => {
  contrastOut.value = formatSigned(+contrastInput.value);
});
saturationInput.addEventListener('input', () => {
  saturationOut.value = formatSigned(+saturationInput.value);
});
blurInput.addEventListener('input', () => {
  blurOut.value = blurInput.value;
});
sharpenAmount.addEventListener('input', () => {
  sharpenAmountOut.value = `${sharpenAmount.value}%`;
});
sharpenRadius.addEventListener('input', () => {
  sharpenRadiusOut.value = sharpenRadius.value;
});

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0] ?? null;
  currentFile = file;
  lastBlob = null;
  downloadBtn.disabled = true;
  if (!file) {
    applyBtn.disabled = true;
    batchBtn.disabled = true;
    return;
  }
  lastFilename = makeOutputFilename(file.name);
  await drawOriginalPreview(file);
  applyBtn.disabled = false;
  batchBtn.disabled = false;
  log(`Loaded ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
});

applyBtn.addEventListener('click', async () => {
  if (!currentFile) return;
  applyBtn.disabled = true;
  batchBtn.disabled = true;
  downloadBtn.disabled = true;

  try {
    const pipeline = await buildPipeline(currentFile);
    const result = await pipeline.run(currentFile, { format: 'image/png' });
    lastBlob = result.blob;
    await drawBlobToCanvas(result.blob, outputCanvas);
    log(
      `Done in ${result.stats.durationMs.toFixed(1)} ms · ` +
        `${result.width.toString()}x${result.height.toString()} · ` +
        `${(result.blob.size / 1024).toFixed(1)} KB · ` +
        `pool alloc ${result.stats.poolAllocations.toString()}, reuse ${result.stats.poolReuses.toString()} · ` +
        `cache size ${result.stats.cacheSize.toString()}`,
    );
    downloadBtn.disabled = false;
  } catch (err) {
    if (err instanceof PixflowError) {
      log(`[${err.code}] ${err.message}`);
      setStatus(`${err.code}: ${err.message}`, 'error');
    } else {
      log(`Unexpected error: ${String(err)}`);
    }
  } finally {
    applyBtn.disabled = false;
    batchBtn.disabled = false;
  }
});

batchBtn.addEventListener('click', async () => {
  if (!currentFile) return;
  applyBtn.disabled = true;
  batchBtn.disabled = true;
  const sources = Array.from({ length: 10 }, () => currentFile!);
  const pipeline = await buildPipeline(currentFile);
  const start = performance.now();
  try {
    const results = await pipeline.batch(sources, {
      format: 'image/png',
      onProgress: (done, total) => {
        log(`batch progress ${done.toString()}/${total.toString()}`);
      },
    });
    const elapsed = performance.now() - start;
    const last = results[results.length - 1];
    log(
      `Batch x${results.length.toString()} in ${elapsed.toFixed(1)} ms · ` +
        `avg ${(elapsed / results.length).toFixed(1)} ms/image · ` +
        `final pool alloc ${last?.stats.poolAllocations.toString() ?? '0'}, reuse ${last?.stats.poolReuses.toString() ?? '0'}`,
    );
  } catch (err) {
    log(`Batch error: ${String(err)}`);
  } finally {
    applyBtn.disabled = false;
    batchBtn.disabled = false;
  }
});

downloadBtn.addEventListener('click', () => {
  if (!lastBlob) return;
  const url = URL.createObjectURL(lastBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = lastFilename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

async function buildPipeline(file: File): Promise<Pipeline> {
  // Reuse a shared Pipeline instance so the pipeline cache and texture pool
  // amortize compile + allocation cost across runs. We rebuild the filter list
  // each time to reflect current control values.
  resetFilters(sharedPipeline);

  if (orientInput.checked && file.type === 'image/jpeg') {
    const orientation = await readExifOrientation(file);
    if (orientation !== 1) sharedPipeline.orient(orientation);
  }

  if (resizeEnabled.checked) {
    sharedPipeline.resize({
      width: +resizeWidth.value,
      fit: resizeFit.value as ResizeFit,
    });
  }

  const b = +brightnessInput.value / 100;
  const c = +contrastInput.value / 100;
  const s = +saturationInput.value / 100;
  if (b !== 0) sharedPipeline.brightness(b);
  if (c !== 0) sharedPipeline.contrast(c);
  if (s !== 0) sharedPipeline.saturation(s);

  const blur = +blurInput.value;
  if (blur > 0) sharedPipeline.gaussianBlur(blur);

  const sa = +sharpenAmount.value / 100;
  if (sa > 0) {
    sharedPipeline.unsharpMask({ amount: sa, radius: +sharpenRadius.value });
  }

  const turns = +rotateInput.value;
  if (turns === 1 || turns === 2 || turns === 3) {
    sharedPipeline.rotate90(turns);
  }
  const flip = flipInput.value;
  if (flip === 'h' || flip === 'v' || flip === 'both') {
    sharedPipeline.flip(flip);
  }

  if (sharedPipeline.length === 0) {
    sharedPipeline.brightness(0);
  }
  return sharedPipeline;
}

function resetFilters(p: Pipeline): void {
  // Pipeline doesn't expose a filter-clear method yet. Repopulating is fine
  // because compiled pipelines and pool buckets are owned by the Pipeline
  // instance and survive across rebuilds.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (p as any).filters.length = 0;
}

async function drawOriginalPreview(file: File): Promise<void> {
  const bitmap = await createImageBitmap(file);
  inputCanvas.width = bitmap.width;
  inputCanvas.height = bitmap.height;
  const ctx = inputCanvas.getContext('2d');
  if (!ctx) return;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  outputCanvas.width = 0;
  outputCanvas.height = 0;
}

async function drawBlobToCanvas(blob: Blob, canvas: HTMLCanvasElement): Promise<void> {
  const bitmap = await createImageBitmap(blob);
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
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

function formatSigned(value: number): string {
  if (value > 0) return `+${value.toString()}`;
  return value.toString();
}

function makeOutputFilename(originalName: string): string {
  const dot = originalName.lastIndexOf('.');
  const base = dot > 0 ? originalName.slice(0, dot) : originalName;
  return `${base}.pixflow.png`;
}

function qs<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return el;
}
