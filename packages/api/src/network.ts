// SPDX-License-Identifier: Apache-2.0

import {
  type CarbonSealPrivateState,
  CompiledCarbonSealContract,
  type InstallationReport,
  createPrivateState,
  ledger,
  pureCircuits,
  withReport,
} from '@carbonseal/contract';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { type Observable, map, shareReplay } from 'rxjs';

import type { AttestInput, CarbonSealClient, CertifyInput, StoredReport } from './client.js';
import {
  type CarbonSealContract,
  type CarbonSealProviders,
  type DeployedCarbonSealContract,
  carbonSealPrivateStateKey,
} from './common-types.js';
import { fromHex, labelToBytes, randomBytes, toHex } from './encoding.js';
import { type RegistrySnapshot, snapshotFromLedger } from './registry.js';

/**
 * A {@link CarbonSealClient} for a contract deployed on a Midnight network.
 *
 * Every call builds a zero-knowledge proof through the configured proof
 * provider and is balanced and submitted by the connected wallet. Private
 * state (secret key and installation reports) lives in the private state
 * provider and never leaves this device.
 */
export class CarbonSealNetworkClient implements CarbonSealClient {
  readonly contractAddress: string;
  readonly state$: Observable<RegistrySnapshot>;

  private constructor(
    private readonly deployed: DeployedCarbonSealContract,
    private readonly providers: CarbonSealProviders,
  ) {
    this.contractAddress = deployed.deployTxData.public.contractAddress;
    providers.privateStateProvider.setContractAddress(this.contractAddress);
    this.state$ = providers.publicDataProvider
      .contractStateObservable(this.contractAddress, { type: 'latest' })
      .pipe(
        map((state) => snapshotFromLedger(ledger(state.data))),
        shareReplay({ bufferSize: 1, refCount: true }),
      );
  }

  /** Deploys a new registry; the caller's key becomes the accreditation authority. */
  static async deploy(
    providers: CarbonSealProviders,
    secretKey: Uint8Array = randomBytes(32),
  ): Promise<CarbonSealNetworkClient> {
    const deployed = await deployContract(providers, {
      compiledContract: CompiledCarbonSealContract,
      privateStateId: carbonSealPrivateStateKey,
      initialPrivateState: createPrivateState(secretKey),
      args: [pureCircuits.publicKey(secretKey)],
    });
    return new CarbonSealNetworkClient(deployed, providers);
  }

  /** Joins an existing registry, reusing this device's private state if it has any. */
  static async join(providers: CarbonSealProviders, contractAddress: string): Promise<CarbonSealNetworkClient> {
    providers.privateStateProvider.setContractAddress(contractAddress);
    const existing = await providers.privateStateProvider.get(carbonSealPrivateStateKey);
    const deployed = await findDeployedContract<CarbonSealContract>(providers, {
      contractAddress,
      compiledContract: CompiledCarbonSealContract,
      privateStateId: carbonSealPrivateStateKey,
      initialPrivateState: existing ?? createPrivateState(randomBytes(32)),
    });
    return new CarbonSealNetworkClient(deployed, providers);
  }

  async publicKey(): Promise<string> {
    return toHex(pureCircuits.publicKey((await this.privateState()).secretKey));
  }

  async reports(): Promise<readonly StoredReport[]> {
    const { reports } = await this.privateState();
    return Object.entries(reports).map(([commitment, report]) => ({ commitment, report }));
  }

  async storeReport(report: InstallationReport): Promise<string> {
    const commitment = pureCircuits.reportCommitment(report);
    const next = withReport(await this.privateState(), commitment, report);
    await this.providers.privateStateProvider.set(carbonSealPrivateStateKey, next);
    return toHex(commitment);
  }

  async addVerifier(verifierPk: string): Promise<void> {
    await this.deployed.callTx.addVerifier(fromHex(verifierPk));
  }

  async removeVerifier(verifierPk: string): Promise<void> {
    await this.deployed.callTx.removeVerifier(fromHex(verifierPk));
  }

  async attest(input: AttestInput): Promise<void> {
    await this.deployed.callTx.attest(
      fromHex(input.commitment),
      fromHex(input.operatorPk),
      input.productCode,
      input.period,
    );
  }

  async revoke(commitment: string): Promise<void> {
    await this.deployed.callTx.revoke(fromHex(commitment));
  }

  async certify(input: CertifyInput): Promise<void> {
    await this.deployed.callTx.certify(
      labelToBytes(input.shipmentRef),
      fromHex(input.commitment),
      input.thresholdKgPerTonne,
      input.tonnes,
      labelToBytes(input.buyerRef),
    );
  }

  private async privateState(): Promise<CarbonSealPrivateState> {
    this.providers.privateStateProvider.setContractAddress(this.contractAddress);
    const state = await this.providers.privateStateProvider.get(carbonSealPrivateStateKey);
    if (state === null) throw new Error('No CarbonSeal private state on this device');
    return state;
  }
}
