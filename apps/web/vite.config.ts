// SPDX-License-Identifier: Apache-2.0

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';

// The compiled contract runs in the browser through compact-runtime, whose
// on-chain runtime ships as WebAssembly; the esnext target keeps its top-level await.
export default defineConfig({
  cacheDir: './.vite',
  plugins: [react(), wasm()],
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 4096,
  },
  optimizeDeps: {
    include: ['@midnight-ntwrk/compact-runtime'],
    exclude: ['@midnight-ntwrk/onchain-runtime-v3'],
  },
  resolve: {
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.wasm'],
  },
});
