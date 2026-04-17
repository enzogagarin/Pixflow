/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readdirSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// Resolve onnxruntime-web's dist directory. pnpm hoists it into
// node_modules/.pnpm/onnxruntime-web@<ver>_…/node_modules/onnxruntime-web/dist.
// The editor doesn't list ort as a direct dep (it's via @pixflow/editor-ml),
// so we walk the pnpm store rather than rely on require.resolve.
function findOrtDist(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const editorMlDist = resolve(
    here,
    '../../packages/editor-ml/node_modules/onnxruntime-web/dist',
  );
  if (existsSync(editorMlDist)) return editorMlDist;
  const pnpmRoot = resolve(here, '../../node_modules/.pnpm');
  if (existsSync(pnpmRoot)) {
    const match = readdirSync(pnpmRoot).find((e) => e.startsWith('onnxruntime-web@'));
    if (match) {
      const candidate = join(pnpmRoot, match, 'node_modules/onnxruntime-web/dist');
      if (existsSync(candidate)) return candidate;
    }
  }
  throw new Error('vite.config: could not locate onnxruntime-web/dist');
}

const ortDist = findOrtDist();

// The editor consumes pixflow from source (not built dist/) for fast HMR.
// The workspace dependency `"pixflow": "workspace:*"` keeps type resolution
// honest; the Vite alias below bypasses the built output at dev time so
// changes to pixflow source hot-reload into the editor immediately.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Serve onnxruntime-web's WASM runtime same-origin at /ort/<file>. In
    // dev this aliases the dist directory via Vite's static middleware; in
    // build it copies the files into the output under `ort/`. Either way
    // the editor never pulls ort from a CDN.
    viteStaticCopy({
      targets: [
        {
          src: [
            `${ortDist}/ort-wasm-simd-threaded.mjs`,
            `${ortDist}/ort-wasm-simd-threaded.wasm`,
            `${ortDist}/ort-wasm-simd-threaded.jsep.mjs`,
            `${ortDist}/ort-wasm-simd-threaded.jsep.wasm`,
          ],
          dest: 'ort',
        },
      ],
    }),
  ],
  resolve: {
    alias: [
      // Exact-match alias only: `import 'pixflow'` routes to source for HMR,
      // but sub-paths like `import 'pixflow/package.json'` fall through to
      // normal node resolution (which respects the package's `exports` map).
      {
        find: /^pixflow$/,
        replacement: resolve(__dirname, '../../packages/pixflow/src/index.ts'),
      },
    ],
  },
  server: {
    port: 5175,
    strictPort: false,
    open: false,
    fs: {
      allow: [resolve(__dirname, '../..')],
    },
  },
  optimizeDeps: {
    exclude: ['pixflow'],
  },
  test: {
    // Default to node env (fast, no DOM). Tests that need a DOM
    // (React renderHook for hook tests) opt-in via the
    // `// @vitest-environment jsdom` directive at the top of the file.
    environment: 'node',
  },
});
