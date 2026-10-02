// SPDX-License-Identifier: Apache-2.0

import {
  type CircuitContext,
  type CircuitResults,
  CostModel,
  QueryContext,
  createConstructorContext,
  sampleContractAddress,
} from '@midnight-ntwrk/compact-runtime';

import {
  Contract,
  type InstallationReport,
  type Ledger,
  ledger,
  pureCircuits,
} from './managed/carbonseal/contract/index.js';
import { type CarbonSealPrivateState, createPrivateState, witnesses, withReport } from './witnesses.js';

export type ShipmentRequest = {
  readonly shipmentId: Uint8Array;
  readonly commitment: Uint8Array;
  readonly thresholdKgPerTonne: bigint;
  readonly tonnes: bigint;
  readonly buyer: Uint8Array;
};

/**
 * Runs the compiled CarbonSeal contract in-process, without proofs or a network.
 *
 * Every participant keeps its own private state, exactly as it would in its own
 * wallet; a call runs the real circuit logic against the shared ledger with the
 * caller's private state. Used by the contract and API tests.
 */
export class CarbonSealSimulator {
  readonly contract = new Contract<CarbonSealPrivateState>(witnesses);
  readonly #parties = new Map<string, CarbonSealPrivateState>();
  #context: CircuitContext<CarbonSealPrivateState>;

  constructor(authorityId: string, authoritySecretKey: Uint8Array) {
    const initial = createPrivateState(authoritySecretKey);
    const { currentPrivateState, currentContractState, currentZswapLocalState } = this.contract.initialState(
      createConstructorContext(initial, '0'.repeat(64)),
      pureCircuits.publicKey(authoritySecretKey),
    );
    this.#parties.set(authorityId, currentPrivateState);
    this.#context = {
      currentPrivateState,
      currentZswapLocalState,
      costModel: CostModel.initialCostModel(),
      currentQueryContext: new QueryContext(currentContractState.data, sampleContractAddress()),
    };
  }

  register(id: string, secretKey: Uint8Array): Uint8Array {
    if (this.#parties.has(id)) throw new Error(`Participant ${id} is already registered`);
    this.#parties.set(id, createPrivateState(secretKey));
    return pureCircuits.publicKey(secretKey);
  }

  publicKeyOf(id: string): Uint8Array {
    return pureCircuits.publicKey(this.privateStateOf(id).secretKey);
  }

  privateStateOf(id: string): CarbonSealPrivateState {
    const state = this.#parties.get(id);
    if (state === undefined) throw new Error(`Unknown participant ${id}`);
    return state;
  }

  /** Keeps a report in the operator's private state and returns its public commitment. */
  storeReport(id: string, report: InstallationReport): Uint8Array {
    const commitment = pureCircuits.reportCommitment(report);
    this.#parties.set(id, withReport(this.privateStateOf(id), commitment, report));
    return commitment;
  }

  ledger(): Ledger {
    return ledger(this.#context.currentQueryContext.state);
  }

  addVerifier(caller: string, verifierPk: Uint8Array): void {
    this.#run(caller, (ctx) => this.contract.impureCircuits.addVerifier(ctx, verifierPk));
  }

  removeVerifier(caller: string, verifierPk: Uint8Array): void {
    this.#run(caller, (ctx) => this.contract.impureCircuits.removeVerifier(ctx, verifierPk));
  }

  attest(caller: string, commitment: Uint8Array, operatorPk: Uint8Array, productCode: bigint, period: bigint): void {
    this.#run(caller, (ctx) =>
      this.contract.impureCircuits.attest(ctx, commitment, operatorPk, productCode, period),
    );
  }

  revoke(caller: string, commitment: Uint8Array): void {
    this.#run(caller, (ctx) => this.contract.impureCircuits.revoke(ctx, commitment));
  }

  certify(caller: string, req: ShipmentRequest): void {
    this.#run(caller, (ctx) =>
      this.contract.impureCircuits.certify(
        ctx,
        req.shipmentId,
        req.commitment,
        req.thresholdKgPerTonne,
        req.tonnes,
        req.buyer,
      ),
    );
  }

  #run<R>(
    caller: string,
    circuit: (ctx: CircuitContext<CarbonSealPrivateState>) => CircuitResults<CarbonSealPrivateState, R>,
  ): R {
    const { result, context } = circuit({ ...this.#context, currentPrivateState: this.privateStateOf(caller) });
    this.#context = context;
    this.#parties.set(caller, context.currentPrivateState);
    return result;
  }
}
