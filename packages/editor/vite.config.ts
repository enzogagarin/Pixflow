/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The editor consumes pixflow from source (not built dist/) for fast HMR.
// The workspace dependency `"pixflow": "workspace:*"` keeps type resolution
// honest; the Vite alias below bypasses the built output at dev time so
// changes to pixflow source hot-reload into the editor immediately.
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
