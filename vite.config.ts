import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(__dirname, 'examples/vanilla-js'),
  resolve: {
    alias: {
      pixflow: resolve(__dirname, 'src/index.ts'),
    },
  },
  server: {
    port: 5173,
    open: false,
    fs: {
      allow: [resolve(__dirname)],
    },
  },
  optimizeDeps: {
    exclude: ['pixflow'],
  },
});
