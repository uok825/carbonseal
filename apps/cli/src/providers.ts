// SPDX-License-Identifier: Apache-2.0

import path from 'node:path';

import {
  type CarbonSealCircuitKeys,
  type CarbonSealPrivateStateId,
  type CarbonSealProviders,
  keyValuePrivateStateProvider,
} from '@carbonseal/api';
import type { CarbonSealPrivateState } from '@carbonseal/contract';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import type { EnvironmentConfiguration, MidnightWalletProvider } from '@midnight-ntwrk/testkit-js';

import { cliRoot, zkConfigPath } from './config.js';
import { fileStore } from './file-store.js';

/**
 * Providers for one participant. Participants share the wallet that pays fees
 * but each keeps its own private state file, i.e. its own CarbonSeal identity.
 */
export const participantProviders = (
  env: EnvironmentConfiguration,
  wallet: MidnightWalletProvider,
  participant: string,
): CarbonSealProviders => {
  const zkConfigProvider = new NodeZkConfigProvider<CarbonSealCircuitKeys>(zkConfigPath);
  const stateFile = path.join(cliRoot, '.state', env.networkId, `${participant}.json`);
  return {
    privateStateProvider: keyValuePrivateStateProvider<CarbonSealPrivateStateId, CarbonSealPrivateState>(
      fileStore(stateFile),
    ),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(env.proofServer, zkConfigProvider),
    publicDataProvider: indexerPublicDataProvider(env.indexer, env.indexerWS),
    walletProvider: wallet,
    midnightProvider: wallet,
  };
};
