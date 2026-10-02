// SPDX-License-Identifier: Apache-2.0
//
// DUST registration follows midnightntwrk/midnight-local-dev (Apache-2.0).

import { type EnvironmentConfiguration, MidnightWalletProvider, syncWallet } from '@midnight-ntwrk/testkit-js';
import type { Logger } from 'pino';
import * as Rx from 'rxjs';

const isComplete = (progress: unknown): boolean => {
  const fn = (progress as { isStrictlyComplete?: () => boolean } | undefined)?.isStrictlyComplete;
  return typeof fn === 'function' && fn.call(progress);
};

/** Builds, starts and syncs a wallet, and makes sure it can pay fees in DUST. */
export const openWallet = async (
  logger: Logger,
  env: EnvironmentConfiguration,
  seed: string,
): Promise<MidnightWalletProvider> => {
  const provider = await MidnightWalletProvider.build(logger, env, seed);
  await provider.start();
  logger.info('Syncing wallet…');
  await syncWallet(provider.wallet, 2_000, 600_000);
  await ensureDust(logger, provider);
  return provider;
};

/** Registers unregistered NIGHT for DUST generation and waits for a spendable DUST coin. */
const ensureDust = async (logger: Logger, provider: MidnightWalletProvider): Promise<void> => {
  const { wallet, unshieldedKeystore } = provider;
  const state = await Rx.firstValueFrom(wallet.state().pipe(Rx.filter((s) => isComplete(s.unshielded.progress))));
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
      Rx.filter((s) => s.dust.availableCoins.length >= 1),
      Rx.timeout({ each: 300_000, with: () => Rx.throwError(() => new Error('No spendable DUST after 5 minutes')) }),
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
