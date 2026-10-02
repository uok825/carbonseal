// SPDX-License-Identifier: Apache-2.0

import type { InstallationReport } from '@carbonseal/contract';
import type { Observable } from 'rxjs';

import type { RegistrySnapshot } from './registry.js';

export type StoredReport = {
  readonly commitment: string;
  readonly report: InstallationReport;
};

export type AttestInput = {
  readonly commitment: string;
  readonly operatorPk: string;
  readonly productCode: bigint;
  readonly period: bigint;
};

export type CertifyInput = {
  readonly shipmentRef: string;
  readonly commitment: string;
  readonly thresholdKgPerTonne: bigint;
  readonly tonnes: bigint;
  readonly buyerRef: string;
};

/**
 * One participant's handle on a CarbonSeal registry.
 *
 * The same interface is backed by the in-process simulator (local demo) and by
 * midnight-js against a real network, so the UI does not care which it gets.
 * Hex strings are used for all byte values crossing this boundary.
 */
export interface CarbonSealClient {
  readonly contractAddress: string;
  readonly state$: Observable<RegistrySnapshot>;

  /** This participant's public key, as stored on the ledger. */
  publicKey(): Promise<string>;

  /** Private reports held by this participant. Never leaves the device. */
  reports(): Promise<readonly StoredReport[]>;
  storeReport(report: InstallationReport): Promise<string>;

  addVerifier(verifierPk: string): Promise<void>;
  removeVerifier(verifierPk: string): Promise<void>;
  attest(input: AttestInput): Promise<void>;
  revoke(commitment: string): Promise<void>;
  certify(input: CertifyInput): Promise<void>;
}
