// SPDX-License-Identifier: Apache-2.0
//
// Wallet connection and provider setup follow midnightntwrk/example-bboard
// (Apache-2.0), adapted to CarbonSeal.

import {
  type CarbonSealCircuitKeys,
  CarbonSealNetworkClient,
  type CarbonSealPrivateStateId,
  type CarbonSealProviders,
} from '@carbonseal/api';
import type { CarbonSealPrivateState } from '@carbonseal/contract';
import type { ConnectedAPI, InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { fromHex, toHex } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import {
  type Binding,
  type FinalizedTransaction,
  type Proof,
  type SignatureEnabled,
  Transaction,
  type TransactionId,
} from '@midnight-ntwrk/midnight-js-protocol/ledger';
import type { UnboundTransaction } from '@midnight-ntwrk/midnight-js-types';
import semver from 'semver';

import { createAuditChannel } from './audit-channel';
import { browserPrivateStateProvider } from './browser-private-state';
import type { Backend, Participant, Role } from './types';

const COMPATIBLE_CONNECTOR_API_VERSION = '4.x';

const findWallet = (): InitialAPI | undefined =>
  Object.values(window.midnight ?? {}).find(
    (wallet) =>
      !!wallet &&
      typeof wallet === 'object' &&
      typeof wallet.apiVersion === 'string' &&
      semver.satisfies(wallet.apiVersion, COMPATIBLE_CONNECTOR_API_VERSION),
  );

const connectWallet = async (networkId: string): Promise<ConnectedAPI> => {
  // Wallet extensions inject themselves shortly after page load.
  for (let attempt = 0; attempt < 20; attempt++) {
    const wallet = findWallet();
    if (wallet) return wallet.connect(networkId);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('No Midnight wallet found. Install Lace or 1AM and enable Midnight.');
};

const createProviders = async (wallet: ConnectedAPI): Promise<CarbonSealProviders> => {
  const config = await wallet.getConfiguration();
  if (!config.proverServerUri) {
    throw new Error('The wallet has no proof server configured. Start one locally on port 6300.');
  }
  const zkConfigProvider = new FetchZkConfigProvider<CarbonSealCircuitKeys>(window.location.origin, fetch.bind(window));
  const addresses = await wallet.getShieldedAddresses();
  return {
    privateStateProvider: browserPrivateStateProvider<CarbonSealPrivateStateId, CarbonSealPrivateState>(),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(config.proverServerUri, zkConfigProvider),
    publicDataProvider: indexerPublicDataProvider(config.indexerUri, config.indexerWsUri),
    walletProvider: {
      getCoinPublicKey: () => addresses.shieldedCoinPublicKey,
      getEncryptionPublicKey: () => addresses.shieldedEncryptionPublicKey,
      balanceTx: async (tx: UnboundTransaction): Promise<FinalizedTransaction> => {
        const balanced = await wallet.balanceUnsealedTransaction(toHex(tx.serialize()));
        return Transaction.deserialize<SignatureEnabled, Proof, Binding>(
          'signature',
          'proof',
          'binding',
          fromHex(balanced.tx),
        );
      },
    },
    midnightProvider: {
      submitTx: async (tx: FinalizedTransaction): Promise<TransactionId> => {
        await wallet.submitTransaction(toHex(tx.serialize()));
        const [txId] = tx.identifiers();
        if (txId === undefined) throw new Error('Submitted transaction has no identifier');
        return txId;
      },
    },
  };
};

/**
 * Connects to the user's wallet and joins (or deploys) a CarbonSeal registry.
 * One wallet is one participant, so every workspace acts through the same client;
 * the contract itself decides which role the wallet's key is allowed to play.
 */
export const createNetworkBackend = async (networkId: string, contractAddress?: string): Promise<Backend> => {
  const wallet = await connectWallet(networkId);
  const providers = await createProviders(wallet);
  const client = contractAddress
    ? await CarbonSealNetworkClient.join(providers, contractAddress)
    : await CarbonSealNetworkClient.deploy(providers);
  const self = await client.publicKey();

  const participant = (role: Role): Participant => ({
    role,
    name: 'Your wallet',
    detail: `Acting as ${role} · ${networkId}`,
    client,
  });

  return {
    mode: 'network',
    networkLabel: networkId.charAt(0).toUpperCase() + networkId.slice(1),
    contractAddress: client.contractAddress,
    participants: {
      authority: participant('authority'),
      verifier: participant('verifier'),
      operator: participant('operator'),
    },
    audits: createAuditChannel(),
    nameFor: (pk) => (pk === self ? 'You' : undefined),
  };
};
