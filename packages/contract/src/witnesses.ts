// SPDX-License-Identifier: Apache-2.0

import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';
import type { InstallationReport, Ledger } from './managed/carbonseal/contract/index.js';

/**
 * Everything CarbonSeal keeps off-chain for one participant.
 *
 * `secretKey` identifies the participant (authority, verifier or operator);
 * only `publicKey(secretKey)` ever reaches the ledger. `reports` holds an
 * operator's installation reports keyed by their hex commitment — this is the
 * data the contract proves facts about without disclosing it.
 */
export type CarbonSealPrivateState = {
  readonly secretKey: Uint8Array;
  readonly reports: Readonly<Record<string, InstallationReport>>;
};

export const createPrivateState = (
  secretKey: Uint8Array,
  reports: Record<string, InstallationReport> = {},
): CarbonSealPrivateState => ({ secretKey, reports });

export const withReport = (
  state: CarbonSealPrivateState,
  commitment: Uint8Array,
  report: InstallationReport,
): CarbonSealPrivateState => ({
  ...state,
  reports: { ...state.reports, [bytesToHex(commitment)]: report },
});

export const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export const witnesses = {
  localSecretKey: ({
    privateState,
  }: WitnessContext<Ledger, CarbonSealPrivateState>): [CarbonSealPrivateState, Uint8Array] => [
    privateState,
    privateState.secretKey,
  ],

  installationReport: (
    { privateState }: WitnessContext<Ledger, CarbonSealPrivateState>,
    commitment: Uint8Array,
  ): [CarbonSealPrivateState, InstallationReport] => {
    const report = privateState.reports[bytesToHex(commitment)];
    if (report === undefined) {
      throw new Error('No private installation report is stored for this commitment');
    }
    return [privateState, report];
  },
};
