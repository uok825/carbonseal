// SPDX-License-Identifier: Apache-2.0

import { appendFileSync, mkdirSync } from 'node:fs';
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
import type { FinalizedTransaction } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import type { UnboundTransaction, WalletProvider } from '@midnight-ntwrk/midnight-js-types';
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
    walletProvider: process.env.CARBONSEAL_DEBUG_TX ? dumpingWallet(wallet, participant) : wallet,
    midnightProvider: wallet,
  };
};

/** Shape of a balanced transaction, for diagnosing node rejections. */
const describeTx = (tx: FinalizedTransaction): string =>
  [...(tx.intents?.entries() ?? [])]
    .map(([segment, intent]) => {
      const dust = intent.dustActions
        ? `spends=${intent.dustActions.spends.length} registrations=${intent.dustActions.registrations.length}`
        : 'none';
      return `segment ${segment}: contractActions=${intent.actions.length} dust[${dust}] guaranteedUnshielded=${intent.guaranteedUnshieldedOffer !== undefined} fallibleUnshielded=${intent.fallibleUnshieldedOffer !== undefined}`;
    })
    .join('\n');

/** Set CARBONSEAL_DEBUG_TX=1 to write every balanced transaction to .state/tx-dumps. */
const dumpingWallet = (wallet: WalletProvider, participant: string): WalletProvider => {
  const dir = path.join(cliRoot, '.state', 'tx-dumps');
  mkdirSync(dir, { recursive: true });
  return {
    getCoinPublicKey: () => wallet.getCoinPublicKey(),
    getEncryptionPublicKey: () => wallet.getEncryptionPublicKey(),
    balanceTx: async (tx: UnboundTransaction, ttl?: Date) => {
      const balanced = await wallet.balanceTx(tx, ttl);
      const header = `=== ${new Date().toISOString()} ${participant} ${balanced.identifiers()[0] ?? ''}`;
      appendFileSync(path.join(dir, 'summary.txt'), `${header}\n${describeTx(balanced)}\n`);
      appendFileSync(path.join(dir, 'full.txt'), `${header}\n${balanced.toString()}\n`);
      return balanced;
    },
  };
};
