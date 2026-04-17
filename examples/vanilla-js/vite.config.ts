import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// The demo consumes the pixflow library from source (not built output) for
// fast iteration. The workspace-level dependency `"pixflow": "workspace:*"`
// keeps type resolution honest; Vite's alias bypasses the built `dist/` for
// dev-time hot reload directly from pixflow source.
export default defineConfig({
  root: __dirname,
  resolve: {
    alias: {
      pixflow: resolve(__dirname, '../../packages/pixflow/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    open: false,
    fs: {
      allow: [resolve(__dirname, '../..')],
    },
  },
  optimizeDeps: {
    exclude: ['pixflow'],
  },
});
