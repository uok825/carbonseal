// SPDX-License-Identifier: Apache-2.0
//
// Prints a registry's public state as read from the indexer.
//
//   npx tsx src/inspect.ts <local|preprod> <contract address>

import { snapshotFromLedger } from '@carbonseal/api';
import { ledger } from '@carbonseal/contract';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { WebSocket } from 'ws';

import { NETWORKS, parseNetwork } from './config.js';

(globalThis as { WebSocket?: unknown }).WebSocket = WebSocket;

const env = NETWORKS[parseNetwork(process.argv[2])];
const address = process.argv[3];
if (!address) throw new Error('Usage: inspect.ts <network> <contract address>');
setNetworkId(env.networkId);

const state = await indexerPublicDataProvider(env.indexer, env.indexerWS).queryContractState(address);
if (!state) throw new Error(`No contract at ${address}`);
const snapshot = snapshotFromLedger(ledger(state.data));
console.log(JSON.stringify(snapshot, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v), 2));
process.exit(0);
