// SPDX-License-Identifier: Apache-2.0
//
// Deploys a CarbonSeal registry and drives every circuit against a real
// Midnight network with real zero-knowledge proofs, then records the contract
// address and transaction receipts in deployments/<network>.json.
//
//   npm run scenario:local -w @carbonseal/cli      # midnight-local-dev devnet
//   npm run scenario:preprod -w @carbonseal/cli    # needs CARBONSEAL_WALLET_SEED

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { CarbonSealNetworkClient, type TxReceipt, buildReport, toHex } from '@carbonseal/api';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import pino from 'pino';
import { firstValueFrom } from 'rxjs';
import { WebSocket } from 'ws';

import { NETWORKS, cliRoot, parseNetwork, walletSeedFor } from './config.js';
import { participantProviders } from './providers.js';
import { openWallet, withDustRetry } from './wallet.js';

// The indexer client subscribes over WebSockets.
(globalThis as { WebSocket?: unknown }).WebSocket = WebSocket;

const network = parseNetwork(process.argv[2]);
const env = NETWORKS[network];
const logger = pino({ level: process.env.LOG_LEVEL ?? 'info', transport: { target: 'pino-pretty' } });

type Step = { step: string; seconds: number; receipt: TxReceipt | 'rejected' };
const steps: Step[] = [];

const timed = async (step: string, action: () => Promise<TxReceipt>): Promise<void> => {
  logger.info(`▶ ${step}`);
  const started = Date.now();
  const receipt = await withDustRetry(logger, action);
  const seconds = Math.round((Date.now() - started) / 100) / 10;
  steps.push({ step, seconds, receipt });
  logger.info(`✔ ${step} in ${seconds}s${receipt ? ` · block ${receipt.blockHeight} · tx ${receipt.txId}` : ''}`);
};

const expectRejection = async (step: string, reason: string, action: () => Promise<unknown>): Promise<void> => {
  logger.info(`▶ ${step} (expected to fail)`);
  const started = Date.now();
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes(reason)) throw error;
    steps.push({ step, seconds: Math.round((Date.now() - started) / 100) / 10, receipt: 'rejected' });
    logger.info(`✔ ${step}: rejected with "${reason}"`);
    return;
  }
  throw new Error(`${step} should have been rejected with "${reason}"`);
};

const main = async () => {
  setNetworkId(env.networkId);
  const wallet = await openWallet(logger, env, walletSeedFor(network));

  try {
    logger.info('▶ Deploy registry');
    const deployStarted = Date.now();
    const authority = await withDustRetry(logger, () =>
      CarbonSealNetworkClient.deploy(participantProviders(env, wallet, 'authority')),
    );
    const address = authority.contractAddress;
    steps.push({ step: 'deploy', seconds: Math.round((Date.now() - deployStarted) / 100) / 10, receipt: null });
    logger.info(`✔ Deployed at ${address}`);

    const verifier = await CarbonSealNetworkClient.join(participantProviders(env, wallet, 'verifier'), address);
    const operator = await CarbonSealNetworkClient.join(participantProviders(env, wallet, 'operator'), address);
    const operatorPk = await operator.publicKey();
    const verifierPk = await verifier.publicKey();
    const retiredVerifierPk = toHex(crypto.getRandomValues(new Uint8Array(32)));

    await timed('addVerifier', () => authority.addVerifier(verifierPk));
    await timed('addVerifier (second)', () => authority.addVerifier(retiredVerifierPk));
    await timed('removeVerifier', () => authority.removeVerifier(retiredVerifierPk));

    // 1,700 kg CO2e/t over 120,000 t of hot-rolled coil.
    const coil = buildReport({
      installationRef: 'CLI-TEST-EAF-02',
      productCode: 72083900n,
      period: 2026n,
      directEmissionsTonnes: 156_000,
      indirectEmissionsTonnes: 48_000,
      productionTonnes: 120_000,
    });
    const coilCommitment = await operator.storeReport(coil);
    await timed('attest', () =>
      verifier.attest({ commitment: coilCommitment, operatorPk, productCode: coil.productCode, period: coil.period }),
    );
    const shipmentRef = `CLI-${Date.now().toString(36).toUpperCase()}`;
    await timed('certify', () =>
      operator.certify({
        shipmentRef,
        commitment: coilCommitment,
        thresholdKgPerTonne: 1_900n,
        tonnes: 2_500n,
        buyerRef: 'DE-DEMO-0000001',
      }),
    );
    await expectRejection('certify beyond verified production', 'Shipment exceeds verified production', () =>
      operator.certify({
        shipmentRef: `${shipmentRef}-X`,
        commitment: coilCommitment,
        thresholdKgPerTonne: 1_900n,
        tonnes: 117_501n,
        buyerRef: 'DE-DEMO-0000001',
      }),
    );
    await expectRejection('certify below real intensity', 'Emission intensity exceeds threshold', () =>
      operator.certify({
        shipmentRef: `${shipmentRef}-Y`,
        commitment: coilCommitment,
        thresholdKgPerTonne: 1_699n,
        tonnes: 10n,
        buyerRef: 'DE-DEMO-0000001',
      }),
    );

    const rebar = buildReport({
      installationRef: 'CLI-TEST-EAF-01',
      productCode: 72142000n,
      period: 2026n,
      directEmissionsTonnes: 30_500,
      indirectEmissionsTonnes: 18_300,
      productionTonnes: 80_000,
    });
    const rebarCommitment = await operator.storeReport(rebar);
    await timed('attest (second report)', () =>
      verifier.attest({ commitment: rebarCommitment, operatorPk, productCode: rebar.productCode, period: rebar.period }),
    );
    await timed('revoke', () => verifier.revoke(rebarCommitment));

    const snapshot = await firstValueFrom(authority.state$);
    const certificate = snapshot.certificates.find((c) => c.shipmentLabel === shipmentRef);
    if (!certificate || certificate.tonnes !== 2_500n) throw new Error('Certificate missing from indexed state');
    if (!snapshot.attestations.find((a) => a.commitment === rebarCommitment)?.revoked) {
      throw new Error('Revocation missing from indexed state');
    }
    if (snapshot.verifiers.includes(retiredVerifierPk)) throw new Error('Removed verifier still accredited');
    logger.info(
      `Indexed state: ${snapshot.verifiers.length} verifier(s), ${snapshot.attestations.length} attestation(s), ${snapshot.certificates.length} certificate(s)`,
    );

    const record = {
      network: env.networkId,
      contractAddress: address,
      deployedAt: new Date().toISOString(),
      compiler: '0.31.1',
      proofServer: env.proofServer,
      participants: { authority: snapshot.authority, verifier: verifierPk, operator: operatorPk },
      sampleShipment: shipmentRef,
      steps: steps.map((s) => ({
        ...s,
        receipt: s.receipt === 'rejected' || s.receipt === null ? s.receipt : { ...s.receipt },
      })),
    };
    const dir = path.join(cliRoot, 'deployments');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `${network}.json`), `${JSON.stringify(record, null, 2)}\n`);
    logger.info(`Recorded ${path.join('apps/cli/deployments', `${network}.json`)}`);
    console.table(steps.map((s) => ({ step: s.step, seconds: s.seconds, block: s.receipt && s.receipt !== 'rejected' ? s.receipt.blockHeight : s.receipt })));
  } finally {
    await wallet.stop();
  }
};

main().then(
  () => process.exit(0),
  (error: unknown) => {
    logger.error(error);
    process.exit(1);
  },
);
