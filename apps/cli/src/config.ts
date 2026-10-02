// SPDX-License-Identifier: Apache-2.0

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { EnvironmentConfiguration } from '@midnight-ntwrk/testkit-js';

export type NetworkName = 'local' | 'preprod';

const here = path.dirname(fileURLToPath(import.meta.url));
export const cliRoot = path.resolve(here, '..');
export const zkConfigPath = path.resolve(cliRoot, '../../packages/contract/src/managed/carbonseal');

const proofServer = process.env.MN_PROOF_SERVER_URL ?? 'http://127.0.0.1:6300';

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
    indexer: 'https://indexer.preprod.midnight.network/api/v4/graphql',
    indexerWS: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
    node: 'https://rpc.preprod.midnight.network',
    nodeWS: 'wss://rpc.preprod.midnight.network',
    proofServer,
    faucet: 'https://midnight-tmnight-preprod.nethermind.dev/',
  },
};

/** The local devnet mints all NIGHT to this well-known genesis seed. Never use it elsewhere. */
export const LOCAL_GENESIS_SEED = '0000000000000000000000000000000000000000000000000000000000000001';

export const walletSeedFor = (network: NetworkName): string => {
  const seed = process.env.CARBONSEAL_WALLET_SEED;
  if (seed) return seed;
  if (network === 'local') return LOCAL_GENESIS_SEED;
  throw new Error('Set CARBONSEAL_WALLET_SEED to a funded preprod wallet seed (hex).');
};

export const parseNetwork = (arg: string | undefined): NetworkName => {
  if (arg === 'local' || arg === 'preprod') return arg;
  throw new Error(`Unknown network "${arg ?? ''}". Use "local" or "preprod".`);
};
