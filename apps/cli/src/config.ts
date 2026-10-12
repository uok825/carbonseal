// SPDX-License-Identifier: Apache-2.0

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { EnvironmentConfiguration } from '@midnight-ntwrk/testkit-js';

export type NetworkName = 'local' | 'preprod';

const here = path.dirname(fileURLToPath(import.meta.url));
export const cliRoot = path.resolve(here, '..');
export const zkConfigPath = path.resolve(cliRoot, '../../packages/contract/src/managed/carbonseal');

const proofServer = process.env.MN_PROOF_SERVER_URL ?? 'http://127.0.0.1:6300';

/**
 * Token for the hosted preprod indexer and node (Blockfrost): BLOCKFROST_PROJECT_ID,
 * or .state/blockfrost-preprod.token. Read lazily so local runs never need one.
 */
const blockfrostToken = (): string => {
  const fromEnv = process.env.BLOCKFROST_PROJECT_ID;
  if (fromEnv) return fromEnv;
  const file = path.join(cliRoot, '.state', 'blockfrost-preprod.token');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  throw new Error('Set BLOCKFROST_PROJECT_ID (or apps/cli/.state/blockfrost-preprod.token) to reach preprod.');
};

const blockfrost = (url: string): string => `${url}?project_id=${blockfrostToken()}`;

export const NETWORKS: Record<NetworkName, EnvironmentConfiguration> = {
  // midnightntwrk/midnight-local-dev standalone.yml
  local: {
    walletNetworkId: 'undeployed',
    networkId: 'undeployed',
    indexer: 'http://127.0.0.1:8088/api/v4/graphql',
    indexerWS: 'ws://127.0.0.1:8088/api/v4/graphql/ws',
    node: 'http://127.0.0.1:9944',
    nodeWS: 'ws://127.0.0.1:9944',
    proofServer,
    faucet: '',
  },
  preprod: {
    walletNetworkId: 'preprod',
    networkId: 'preprod',
    get indexer() {
      return blockfrost('https://midnight-preprod.blockfrost.io/api/v0');
    },
    get indexerWS() {
      return blockfrost('wss://midnight-preprod.blockfrost.io/api/v0/ws');
    },
    get node() {
      return blockfrost('https://rpc.midnight-preprod.blockfrost.io');
    },
    get nodeWS() {
      return blockfrost('wss://rpc.midnight-preprod.blockfrost.io');
    },
    proofServer,
    faucet: 'https://midnight-tmnight-preprod.nethermind.dev/',
  },
};

/** The local devnet mints all NIGHT to this well-known genesis seed. Never use it elsewhere. */
export const LOCAL_GENESIS_SEED = '0000000000000000000000000000000000000000000000000000000000000001';

/**
 * The wallet that pays fees: CARBONSEAL_WALLET_SEED if set, the genesis wallet
 * on the local devnet, otherwise a seed kept in .state/<network>-wallet.seed
 * (created on first use, never committed).
 */
export const walletSeedFor = (network: NetworkName): string => {
  const seed = process.env.CARBONSEAL_WALLET_SEED;
  if (seed) return seed;
  if (network === 'local') return LOCAL_GENESIS_SEED;
  const file = path.join(cliRoot, '.state', `${network}-wallet.seed`);
  if (!existsSync(file)) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex'), { mode: 0o600 });
  }
  return readFileSync(file, 'utf8').trim();
};

export const parseNetwork = (arg: string | undefined): NetworkName => {
  if (arg === 'local' || arg === 'preprod') return arg;
  throw new Error(`Unknown network "${arg ?? ''}". Use "local" or "preprod".`);
};
