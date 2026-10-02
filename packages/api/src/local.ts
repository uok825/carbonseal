// SPDX-License-Identifier: Apache-2.0

import type { InstallationReport } from '@carbonseal/contract';
import { CarbonSealSimulator } from '@carbonseal/contract/simulator';
import { BehaviorSubject, type Observable } from 'rxjs';

import type { AttestInput, CarbonSealClient, CertifyInput, StoredReport, TxReceipt } from './client.js';
import { fromHex, labelToBytes, toHex } from './encoding.js';
import { type RegistrySnapshot, snapshotFromLedger } from './registry.js';

/**
 * A registry that runs the compiled contract in this process (no proofs, no network).
 * Each participant gets its own {@link CarbonSealClient} with its own private state.
 */
export class LocalRegistry {
  readonly #sim: CarbonSealSimulator;
  readonly #state: BehaviorSubject<RegistrySnapshot>;
  readonly contractAddress = 'local-simulator';

  constructor(authorityId: string, authoritySecretKey: Uint8Array) {
    this.#sim = new CarbonSealSimulator(authorityId, authoritySecretKey);
    this.#state = new BehaviorSubject(snapshotFromLedger(this.#sim.ledger()));
  }

  get state$(): Observable<RegistrySnapshot> {
    return this.#state;
  }

  get snapshot(): RegistrySnapshot {
    return this.#state.value;
  }

  register(id: string, secretKey: Uint8Array): void {
    this.#sim.register(id, secretKey);
  }

  clientFor(id: string): CarbonSealClient {
    this.#sim.privateStateOf(id);
    const sim = this.#sim;
    const commit = (action: () => void): Promise<TxReceipt> => {
      try {
        action();
        this.#state.next(snapshotFromLedger(sim.ledger()));
        return Promise.resolve(null);
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
      }
    };
    return {
      contractAddress: this.contractAddress,
      state$: this.#state,
      publicKey: () => Promise.resolve(toHex(sim.publicKeyOf(id))),
      reports: () =>
        Promise.resolve(
          Object.entries(sim.privateStateOf(id).reports).map(
            ([commitment, report]): StoredReport => ({ commitment, report }),
          ),
        ),
      storeReport: (report: InstallationReport) => Promise.resolve(toHex(sim.storeReport(id, report))),
      addVerifier: (pk: string) => commit(() => sim.addVerifier(id, fromHex(pk))),
      removeVerifier: (pk: string) => commit(() => sim.removeVerifier(id, fromHex(pk))),
      attest: (input: AttestInput) =>
        commit(() =>
          sim.attest(id, fromHex(input.commitment), fromHex(input.operatorPk), input.productCode, input.period),
        ),
      revoke: (commitment: string) => commit(() => sim.revoke(id, fromHex(commitment))),
      certify: (input: CertifyInput) =>
        commit(() =>
          sim.certify(id, {
            shipmentId: labelToBytes(input.shipmentRef),
            commitment: fromHex(input.commitment),
            thresholdKgPerTonne: input.thresholdKgPerTonne,
            tonnes: input.tonnes,
            buyer: labelToBytes(input.buyerRef),
          }),
        ),
    };
  }
}
