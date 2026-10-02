// SPDX-License-Identifier: Apache-2.0

import type { CarbonSealClient } from '@carbonseal/api';
import type { InstallationReport } from '@carbonseal/contract';
import type { Observable } from 'rxjs';

export type Role = 'authority' | 'verifier' | 'operator';

export type Participant = {
  readonly role: Role;
  readonly name: string;
  readonly detail: string;
  readonly client: CarbonSealClient;
};

/**
 * What an operator hands its verifier off-chain: the full private report plus
 * the commitment it claims to match. The verifier recomputes the commitment
 * before attesting, so a mismatched package can never be attested.
 */
export type AuditPackage = {
  readonly commitment: string;
  readonly operatorPk: string;
  readonly operatorName: string;
  readonly report: InstallationReport;
  readonly submittedAt: number;
};

export interface AuditChannel {
  readonly requests$: Observable<readonly AuditPackage[]>;
  submit(pkg: AuditPackage): void;
  dismiss(commitment: string): void;
}

export type Backend = {
  readonly mode: 'demo' | 'network';
  readonly networkLabel: string;
  readonly contractAddress: string;
  readonly participants: Readonly<Record<Role, Participant>>;
  readonly audits: AuditChannel;
  /** Pre-filled values for the demo walkthrough; absent on a real network. */
  readonly hints?: { readonly buyerName: string; readonly buyerRef: string; readonly sampleShipment: string };
  /** Display name for a public key, from an off-chain directory. */
  nameFor(publicKey: string): string | undefined;
};
