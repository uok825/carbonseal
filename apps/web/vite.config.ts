// SPDX-License-Identifier: Apache-2.0

import react from '@vitejs/plugin-react';
import { type ProxyOptions, defineConfig, loadEnv } from 'vite';
import wasm from 'vite-plugin-wasm';

/** Hosted indexers by network. The browser calls /indexer and the token is added here. */
const INDEXERS: Record<string, string> = {
  preprod: 'https://midnight-preprod.blockfrost.io/api/v0',
  preview: 'https://midnight-preview.blockfrost.io/api/v0',
};

const proxies = (env: Record<string, string>): Record<string, ProxyOptions> => {
  // The dev wallet bridge (apps/cli/src/bridge.ts), reachable at /bridge on this origin.
  const proxy: Record<string, ProxyOptions> = {
    '/bridge': { target: 'http://127.0.0.1:6301', rewrite: (p) => p.replace(/^\/bridge/, '') },
  };
  const upstream = INDEXERS[env.VITE_NETWORK_ID || 'preprod'];
  const token = env.BLOCKFROST_PROJECT_ID;
  if (upstream && token) {
    const withToken = (path: string) => `${path}${path.includes('?') ? '&' : '?'}project_id=${token}`;
    proxy['/indexer/ws'] = {
      target: upstream.replace(/^http/, 'ws'),
      ws: true,
      changeOrigin: true,
      rewrite: (p) => withToken(p.replace(/^\/indexer\/ws/, '/ws')),
    };
    proxy['/indexer'] = {
      target: upstream,
      changeOrigin: true,
      rewrite: (p) => withToken(p.replace(/^\/indexer/, '')),
    };
  }
  return proxy;
};

// The compiled contract runs in the browser through compact-runtime, whose
// on-chain runtime ships as WebAssembly; the esnext target keeps its top-level await.
export default defineConfig(({ mode }) => {
  // BLOCKFROST_PROJECT_ID has no VITE_ prefix, so it stays on the server and never reaches the bundle.
  const env = loadEnv(mode, process.cwd(), '');
  return {
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
    server: { proxy: proxies(env) },
    preview: { proxy: proxies(env) },
    resolve: {
      extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.wasm'],
    },
  };
});
