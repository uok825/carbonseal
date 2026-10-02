// SPDX-License-Identifier: Apache-2.0
//
// Syncs the fee wallet and saves its state, so the next command starts fast.
//
//   npx tsx src/sync.ts <local|preprod>

import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import pino from 'pino';
import { WebSocket } from 'ws';

import { NETWORKS, parseNetwork, walletSeedFor } from './config.js';
import { openWallet } from './wallet.js';

(globalThis as { WebSocket?: unknown }).WebSocket = WebSocket;

const network = parseNetwork(process.argv[2]);
const env = NETWORKS[network];
const logger = pino({ level: process.env.LOG_LEVEL ?? 'info', transport: { target: 'pino-pretty' } });

setNetworkId(env.networkId);
const { provider, save } = await openWallet(logger, env, walletSeedFor(network));
await save();
await provider.stop();
logger.info('Wallet state saved');
process.exit(0);
