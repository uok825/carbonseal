// SPDX-License-Identifier: Apache-2.0
//
// Registry authority actions for the registry recorded in deployments/<network>.json,
// using the authority identity the scenario created in .state/.
//
//   npx tsx src/admin.ts <local|preprod> add-verifier <public key>
//   npx tsx src/admin.ts <local|preprod> remove-verifier <public key>

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { CarbonSealNetworkClient } from '@carbonseal/api';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import pino from 'pino';
import { WebSocket } from 'ws';

import { NETWORKS, cliRoot, parseNetwork, walletSeedFor } from './config.js';
import { participantProviders } from './providers.js';
import { openWallet, withDustRetry } from './wallet.js';

(globalThis as { WebSocket?: unknown }).WebSocket = WebSocket;

const [, , networkArg, command, publicKey] = process.argv;
const network = parseNetwork(networkArg);
const env = NETWORKS[network];
const logger = pino({ level: process.env.LOG_LEVEL ?? 'info', transport: { target: 'pino-pretty' } });

if ((command !== 'add-verifier' && command !== 'remove-verifier') || !/^[0-9a-f]{64}$/i.test(publicKey ?? '')) {
  console.error('Usage: admin.ts <local|preprod> <add-verifier|remove-verifier> <64-hex public key>');
  process.exit(2);
}

const { contractAddress } = JSON.parse(
  readFileSync(path.join(cliRoot, 'deployments', `${network}.json`), 'utf8'),
) as { contractAddress: string };

setNetworkId(env.networkId);
const { provider: wallet, save } = await openWallet(logger, env, walletSeedFor(network));
try {
  const authority = await CarbonSealNetworkClient.join(participantProviders(env, wallet, 'authority'), contractAddress);
  const key = publicKey!.toLowerCase();
  const receipt = await withDustRetry(logger, () =>
    command === 'add-verifier' ? authority.addVerifier(key) : authority.removeVerifier(key),
  );
  logger.info(`✔ ${command} ${key} on ${contractAddress} · block ${receipt?.blockHeight} · tx ${receipt?.txId}`);
} finally {
  await save();
  await wallet.stop();
}
process.exit(0);
