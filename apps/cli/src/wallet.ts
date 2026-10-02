// SPDX-License-Identifier: Apache-2.0
//
// Wallet construction mirrors testkit-js' WalletFactory and DUST registration
// follows midnightntwrk/midnight-local-dev (both Apache-2.0). Unlike testkit,
// the synced state is cached on disk: a fresh sync of preprod replays millions
// of blocks, which takes a long time on a small machine.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { DustSecretKey, LedgerParameters, ZswapSecretKeys } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { type EnvironmentConfiguration, MidnightWalletProvider, WalletSeeds } from '@midnight-ntwrk/testkit-js';
import {
  DustWallet,
  InMemoryTransactionHistoryStorage,
  PublicKey,
  ShieldedWallet,
  UnshieldedWallet,
  WalletEntrySchema,
  WalletFacade,
  createKeystore,
  mergeWalletEntries,
} from '@midnight-ntwrk/wallet-sdk';
import type { Logger } from 'pino';
import * as Rx from 'rxjs';

import { cliRoot } from './config.js';

/**
 * Paid on top of the computed fee, in SPECK (1 DUST = 10^15 SPECK): 0.01 DUST.
 * Midnight's fee prices fall when the network is quiet, and on preprod the
 * computed fee can reach zero. wallet-sdk-dust-wallet 4.2.0 then adds a fee
 * intent with no DUST spends, which the node rejects as "not normalized"
 * (1010, custom error 117), and a fee-less transaction is dropped if prices
 * rise before it is included. A small overhead always buys a real DUST spend.
 */
const FEE_OVERHEAD = 10_000_000_000_000n;

const isComplete = (progress: unknown): boolean => {
  const fn = (progress as { isStrictlyComplete?: () => boolean } | undefined)?.isStrictlyComplete;
  return typeof fn === 'function' && fn.call(progress);
};

type Part = 'shielded' | 'unshielded' | 'dust';

const stateCache = (env: EnvironmentConfiguration, address: string) => {
  const dir = path.join(cliRoot, '.state', `wallet-${env.networkId}-${address.slice(-12)}`);
  const file = (part: Part) => path.join(dir, `${part}.state`);
  return {
    read: (part: Part): string | undefined => (existsSync(file(part)) ? readFileSync(file(part), 'utf8') : undefined),
    write: (part: Part, state: string) => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(file(part), state, { mode: 0o600 });
    },
  };
};

const buildWallet = async (logger: Logger, env: EnvironmentConfiguration, seed: string) => {
  const seeds = WalletSeeds.fromMasterSeed(seed);
  const keystore = createKeystore(seeds.unshielded, env.walletNetworkId);
  const cache = stateCache(env, keystore.getBech32Address().asString());
  const config = {
    indexerClientConnection: { indexerHttpUrl: env.indexer, indexerWsUrl: env.indexerWS },
    provingServerUrl: new URL(env.proofServer),
    networkId: env.walletNetworkId,
    relayURL: new URL(env.nodeWS),
    txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema, mergeWalletEntries),
    costParameters: { feeBlocksMargin: 5 },
  };
  const dustConfig = {
    ...config,
    costParameters: { ledgerParams: LedgerParameters.initialParameters(), additionalFeeOverhead: FEE_OVERHEAD, feeBlocksMargin: 5 },
  };

  const cached = { shielded: cache.read('shielded'), unshielded: cache.read('unshielded'), dust: cache.read('dust') };
  const restoring = cached.shielded !== undefined && cached.unshielded !== undefined && cached.dust !== undefined;
  logger.info(restoring ? 'Restoring wallet from cached state' : 'No cached wallet state; syncing from scratch');

  const Shielded = ShieldedWallet(config);
  const Unshielded = UnshieldedWallet({
    ...config,
    txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema, mergeWalletEntries),
  });
  const Dust = DustWallet(dustConfig);
  const shielded = restoring ? Shielded.restore(cached.shielded!) : Shielded.startWithSeed(seeds.shielded);
  const unshielded = restoring
    ? Unshielded.restore(cached.unshielded!)
    : Unshielded.startWithPublicKey(PublicKey.fromKeyStore(keystore));
  const dust = restoring
    ? Dust.restore(cached.dust!)
    : Dust.startWithSeed(seeds.dust, LedgerParameters.initialParameters().dust);

  const facade = await WalletFacade.init({
    configuration: config,
    shielded: () => shielded,
    unshielded: () => unshielded,
    dust: () => dust,
  });
  const save = async () => {
    cache.write('shielded', await shielded.serializeState());
    cache.write('unshielded', await unshielded.serializeState());
    cache.write('dust', await dust.serializeState());
  };
  const provider = await MidnightWalletProvider.withWallet(
    logger,
    env,
    facade,
    ZswapSecretKeys.fromSeed(seeds.shielded),
    DustSecretKey.fromSeed(seeds.dust),
    keystore,
  );
  return { provider, save };
};

export type OpenWallet = { provider: MidnightWalletProvider; save: () => Promise<void> };

/** Builds, starts and syncs a wallet, and makes sure it can pay fees in DUST. */
export const openWallet = async (logger: Logger, env: EnvironmentConfiguration, seed: string): Promise<OpenWallet> => {
  const { provider, save } = await buildWallet(logger, env, seed);
  await provider.start(false);

  logger.info('Syncing wallet…');
  let lastSave = Date.now();
  await Rx.firstValueFrom(
    provider.wallet.state().pipe(
      Rx.throttleTime(30_000, undefined, { leading: true, trailing: true }),
      Rx.tap((s) =>
        logger.info(
          `Sync: shielded=${isComplete(s.shielded.state.progress)} unshielded=${isComplete(s.unshielded.progress)} dust=${isComplete(s.dust.state.progress)}`,
        ),
      ),
      // Checkpoint long syncs so an interruption does not start over.
      Rx.concatMap(async (s) => {
        if (Date.now() - lastSave > 300_000) {
          lastSave = Date.now();
          await save();
          logger.info('Wallet state checkpointed');
        }
        return s;
      }),
      Rx.filter(
        (s) => isComplete(s.shielded.state.progress) && isComplete(s.unshielded.progress) && isComplete(s.dust.state.progress),
      ),
      // preprod held ~1.6M DUST events in Oct 2026: about three hours from scratch on a 2-vCPU machine.
      Rx.timeout({ first: 8 * 3_600_000, with: () => Rx.throwError(() => new Error('Wallet did not sync within 8 hours')) }),
    ),
  );
  await save();
  logger.info('Wallet synced');
  await ensureDust(logger, provider);
  await save();
  return { provider, save };
};

/** Registers unregistered NIGHT for DUST generation and waits for a spendable DUST coin. */
const ensureDust = async (logger: Logger, provider: MidnightWalletProvider): Promise<void> => {
  const { wallet, unshieldedKeystore } = provider;
  logger.info('Waiting for NIGHT in the wallet…');
  const state = await Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.filter((s) => isComplete(s.unshielded.progress) && s.unshielded.availableCoins.length > 0),
      Rx.timeout({ first: 1_800_000, with: () => Rx.throwError(() => new Error('No NIGHT arrived within 30 minutes')) }),
    ),
  );
  const unregistered = state.unshielded.availableCoins.filter((c) => !c.meta.registeredForDustGeneration);
  if (unregistered.length > 0) {
    logger.info(`Registering ${unregistered.length} NIGHT UTXO(s) for DUST generation…`);
    const recipe = await wallet.registerNightUtxosForDustGeneration(
      unregistered,
      unshieldedKeystore.getPublicKey(),
      (payload) => unshieldedKeystore.signData(payload),
    );
    await wallet.submitTransaction(await wallet.finalizeRecipe(recipe));
  }
  logger.info('Waiting for a spendable DUST coin…');
  await Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(30_000, undefined, { leading: true, trailing: true }),
      Rx.tap((s) => {
        const night = Object.values(s.unshielded.balances).reduce((a, b) => a + b, 0n);
        logger.info(`NIGHT ${night} · DUST ${s.dust.balance(new Date())} · spendable DUST coins ${s.dust.availableCoins.length}`);
      }),
      Rx.filter((s) => s.dust.availableCoins.length >= 1),
      Rx.timeout({ first: 7_200_000, with: () => Rx.throwError(() => new Error('No spendable DUST after 2 hours')) }),
    ),
  );
};

/**
 * A fresh chain can report DUST before the balancer can spend it; the attempt
 * itself is the only readiness check. Other errors propagate immediately.
 */
export const withDustRetry = async <T>(logger: Logger, attempt: () => Promise<T>, timeoutMs = 180_000): Promise<T> => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      return await attempt();
    } catch (error) {
      const dustNotReady = error instanceof Error && /could not balance dust/i.test(error.message);
      if (!dustNotReady || Date.now() > deadline) throw error;
      logger.info('DUST not spendable yet, retrying in 5 s…');
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }
};

