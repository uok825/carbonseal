// SPDX-License-Identifier: Apache-2.0
//
// Wallet connection and provider setup follow midnightntwrk/example-bboard
// (Apache-2.0), adapted to CarbonSeal.
//
// Note: the wallet (Lace, 1AM) balances transactions itself, so the CLI's
// DUST fee-overhead workaround does not apply here.

import {
  type CarbonSealCircuitKeys,
  CarbonSealNetworkClient,
  type CarbonSealPrivateStateId,
  type CarbonSealProviders,
  keyValuePrivateStateProvider,
  webStorageStore,
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

import type { Session } from './types';

const COMPATIBLE_CONNECTOR_API_VERSION = '4.x';

export type WalletChoice = { readonly key: string; readonly name: string; readonly icon: string };

const compatibleWallets = (): [string, InitialAPI][] =>
  Object.entries(window.midnight ?? {}).filter(
    (entry): entry is [string, InitialAPI] =>
      !!entry[1] &&
      typeof entry[1] === 'object' &&
      typeof entry[1].apiVersion === 'string' &&
      semver.satisfies(entry[1].apiVersion, COMPATIBLE_CONNECTOR_API_VERSION),
  );

/** Midnight wallets available in this browser. Extensions inject themselves shortly after load. */
export const listWallets = async (): Promise<WalletChoice[]> => {
  for (let attempt = 0; attempt < 20; attempt++) {
    const found = compatibleWallets();
    if (found.length > 0) return found.map(([key, w]) => ({ key, name: w.name, icon: w.icon }));
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return [];
};

const connectWallet = async (networkId: string, walletKey?: string): Promise<ConnectedAPI> => {
  const wallets = compatibleWallets();
  const wallet = (walletKey ? wallets.find(([key]) => key === walletKey) : wallets[0])?.[1];
  if (!wallet) throw new Error('No Midnight wallet found. Install Lace or 1AM and enable Midnight.');
  return wallet.connect(networkId);
};

/**
 * Wallet errors are DApp Connector APIErrors whose message is often empty;
 * the useful part is in `code` and `reason`. Re-throw them as plain Errors
 * that say which step failed, and keep the original in the console.
 */
const walletStep = async <T>(step: string, call: () => Promise<T>): Promise<T> => {
  try {
    return await call();
  } catch (error) {
    console.error(`Wallet ${step} failed`, error);
    const e = error as { code?: unknown; reason?: unknown; message?: unknown };
    const detail = [e.code, e.reason, e.message].filter((x) => typeof x === 'string' && x !== '').join(': ');
    throw new Error(`Wallet could not ${step}${detail ? `: ${detail}` : ''}`, { cause: error });
  }
};

const createProviders = async (wallet: ConnectedAPI): Promise<CarbonSealProviders> => {
  const config = await wallet.getConfiguration();
  if (!config.proverServerUri) {
    throw new Error('The wallet has no proof server configured. Start one locally on port 6300.');
  }
  const zkConfigProvider = new FetchZkConfigProvider<CarbonSealCircuitKeys>(window.location.origin, fetch.bind(window));
  const addresses = await wallet.getShieldedAddresses();
  return {
    privateStateProvider: keyValuePrivateStateProvider<CarbonSealPrivateStateId, CarbonSealPrivateState>(
      webStorageStore(localStorage),
    ),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(config.proverServerUri, zkConfigProvider),
    publicDataProvider: indexerPublicDataProvider(config.indexerUri, config.indexerWsUri),
    walletProvider: {
      getCoinPublicKey: () => addresses.shieldedCoinPublicKey,
      getEncryptionPublicKey: () => addresses.shieldedEncryptionPublicKey,
      balanceTx: async (tx: UnboundTransaction): Promise<FinalizedTransaction> => {
        const balanced = await walletStep('balance the transaction', () =>
          wallet.balanceUnsealedTransaction(toHex(tx.serialize())),
        );
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
        await walletStep('submit the transaction', () => wallet.submitTransaction(toHex(tx.serialize())));
        const [txId] = tx.identifiers();
        if (txId === undefined) throw new Error('Submitted transaction has no identifier');
        return txId;
      },
    },
  };
};

/**
 * Connects the user's Midnight wallet and joins the registry with it. The
 * wallet balances, signs and submits every transaction; proofs come from the
 * proof server the wallet is configured with. The contract decides which role
 * this wallet's CarbonSeal key may play.
 */
export const connectSession = async (
  networkId: string,
  contractAddress: string,
  walletKey?: string,
): Promise<Session> => {
  const wallet = await connectWallet(networkId, walletKey);
  const providers = await createProviders(wallet);
  const client = await CarbonSealNetworkClient.join(providers, contractAddress);
  return { client, publicKey: await client.publicKey() };
};
