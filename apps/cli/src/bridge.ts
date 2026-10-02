// SPDX-License-Identifier: Apache-2.0
//
// Development wallet bridge. Exposes this machine's synced CLI wallet to the
// web app through the DApp Connector API, so the app can be exercised end to
// end (real proofs, real network) while a browser wallet is still syncing.
//
// It listens on 127.0.0.1 only; reach it through an SSH tunnel and the web
// app's /bridge proxy. Anyone who can reach it can spend this wallet's DUST,
// so never expose it publicly.
//
//   npx tsx src/bridge.ts <local|preprod> [port=6301]

import { createServer } from 'node:http';

import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { DAppConnectorWalletAdapter } from '@midnight-ntwrk/testkit-js';
import pino from 'pino';
import { WebSocket } from 'ws';

import { NETWORKS, parseNetwork, walletSeedFor } from './config.js';
import { openWallet } from './wallet.js';

(globalThis as { WebSocket?: unknown }).WebSocket = WebSocket;

const network = parseNetwork(process.argv[2]);
const port = Number(process.argv[3] ?? 6301);
const env = NETWORKS[network];
const logger = pino({ level: process.env.LOG_LEVEL ?? 'info', transport: { target: 'pino-pretty' } });

/** The DApp Connector methods the web app needs; nothing that moves funds elsewhere. */
const ALLOWED = new Set([
  'getConfiguration',
  'getConnectionStatus',
  'getShieldedAddresses',
  'getUnshieldedAddress',
  'getDustAddress',
  'getDustBalance',
  'getUnshieldedBalances',
  'balanceUnsealedTransaction',
  'submitTransaction',
  'hintUsage',
]);

setNetworkId(env.networkId);
const { provider, save } = await openWallet(logger, env, walletSeedFor(network));
const adapter = new DAppConnectorWalletAdapter(provider, env) as unknown as Record<
  string,
  (...args: unknown[]) => Promise<unknown>
>;

const json = (value: unknown) => JSON.stringify(value, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v));

const server = createServer((req, res) => {
  const reply = (status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(json(body));
  };
  if (req.method === 'GET' && req.url === '/status') {
    reply(200, {
      network: env.networkId,
      name: 'CarbonSeal dev bridge',
      unshieldedAddress: provider.unshieldedKeystore.getBech32Address().asString(),
    });
    return;
  }
  if (req.method !== 'POST' || req.url !== '/rpc') {
    reply(404, { error: 'Not found' });
    return;
  }
  let body = '';
  req.on('data', (chunk: Buffer) => {
    body += chunk.toString();
    if (body.length > 20_000_000) req.destroy();
  });
  req.on('end', () => {
    void (async () => {
      try {
        const { method, params } = JSON.parse(body) as { method: string; params?: unknown[] };
        if (!ALLOWED.has(method)) {
          reply(403, { error: `Method ${method} is not exposed by the bridge` });
          return;
        }
        const started = Date.now();
        const result = await adapter[method]!(...(params ?? []));
        logger.info(`${method} in ${Date.now() - started} ms`);
        reply(200, { result: result ?? null });
      } catch (error) {
        logger.error({ error }, 'Bridge call failed');
        reply(500, { error: error instanceof Error ? error.message : String(error) });
      }
    })();
  });
});

// Keep the cached wallet state fresh so CLI runs after this one start fast.
const checkpoint = setInterval(() => void save().catch((error: unknown) => logger.warn({ error }, 'save failed')), 300_000);

const shutdown = async () => {
  clearInterval(checkpoint);
  server.close();
  await save().catch(() => undefined);
  await provider.stop();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

server.listen(port, '127.0.0.1', () =>
  logger.info(`Wallet bridge for ${env.networkId} listening on http://127.0.0.1:${port}`),
);
