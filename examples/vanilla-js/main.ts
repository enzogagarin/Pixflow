import { isWebGPUSupported, Pipeline, PixflowError } from 'pixflow';

const statusEl = qs<HTMLDivElement>('#status');
const fileInput = qs<HTMLInputElement>('#file-input');
const brightnessInput = qs<HTMLInputElement>('#brightness');
const brightnessOut = qs<HTMLOutputElement>('#brightness-value');
const contrastInput = qs<HTMLInputElement>('#contrast');
const contrastOut = qs<HTMLOutputElement>('#contrast-value');
const applyBtn = qs<HTMLButtonElement>('#apply');
const downloadBtn = qs<HTMLButtonElement>('#download');
const inputCanvas = qs<HTMLCanvasElement>('#input-canvas');
const outputCanvas = qs<HTMLCanvasElement>('#output-canvas');
const logEl = qs<HTMLElement>('#log');

let currentFile: File | null = null;
let lastBlob: Blob | null = null;
let lastFilename = 'pixflow-output.png';

(async () => {
  const supported = await isWebGPUSupported();
  if (!supported) {
    setStatus('WebGPU is not available in this browser. Try Chrome 121+ or Safari 26+.', 'error');
    return;
  }
  setStatus('WebGPU ready. Upload an image to start.', 'ok');
})();

brightnessInput.addEventListener('input', () => {
  brightnessOut.value = formatSigned(+brightnessInput.value);
});
contrastInput.addEventListener('input', () => {
  contrastOut.value = formatSigned(+contrastInput.value);
});

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0] ?? null;
  currentFile = file;
  lastBlob = null;
  downloadBtn.disabled = true;
  if (!file) {
    applyBtn.disabled = true;
    return;
  }
  lastFilename = makeOutputFilename(file.name);
  await drawOriginalPreview(file);
  applyBtn.disabled = false;
  log(`Loaded ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
});

applyBtn.addEventListener('click', async () => {
  if (!currentFile) return;
  applyBtn.disabled = true;
  downloadBtn.disabled = true;
  const brightnessAmount = +brightnessInput.value / 100;
  const contrastAmount = +contrastInput.value / 100;

  log(
    `Running pipeline: brightness(${brightnessAmount.toFixed(2)}), contrast(${contrastAmount.toFixed(2)})`,
  );

  const pipeline = Pipeline.create();
  if (brightnessAmount !== 0) pipeline.brightness(brightnessAmount);
  if (contrastAmount !== 0) pipeline.contrast(contrastAmount);
  if (pipeline.length === 0) {
    pipeline.brightness(0);
  }

  try {
    const result = await pipeline.run(currentFile, { format: 'image/png' });
    lastBlob = result.blob;
    await drawBlobToCanvas(result.blob, outputCanvas);
    log(
      `Done in ${result.stats.durationMs.toFixed(1)} ms · ${result.width}x${result.height} · ${(result.blob.size / 1024).toFixed(1)} KB`,
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
    pipeline.dispose();
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
