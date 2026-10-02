// SPDX-License-Identifier: Apache-2.0
//
// Prints the addresses of the CLI wallet for a network, creating a fresh seed
// on first use. Fund the unshielded address from the network's faucet.
//
//   npm run wallet:preprod -w @carbonseal/cli

import { DustSecretKey } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { FluentWalletBuilder } from '@midnight-ntwrk/testkit-js';
import { DustAddress } from '@midnight-ntwrk/wallet-sdk';

import { NETWORKS, parseNetwork, walletSeedFor } from './config.js';

const network = parseNetwork(process.argv[2]);
const env = NETWORKS[network];
setNetworkId(env.networkId);

const { seeds, keystore } = await FluentWalletBuilder.forEnvironment(env)
  .withSeed(walletSeedFor(network))
  .buildWithoutStarting();

console.log(`Network:     ${env.networkId}`);
console.log(`Unshielded:  ${keystore.getBech32Address().asString()}   ← faucet`);
console.log(`DUST:        ${DustAddress.encodePublicKey(env.networkId, DustSecretKey.fromSeed(seeds.dust).publicKey)}`);
if (env.faucet) console.log(`Faucet:      ${env.faucet}`);
process.exit(0);
