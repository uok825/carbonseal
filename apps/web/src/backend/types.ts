// SPDX-License-Identifier: Apache-2.0

import type { CarbonSealClient } from '@carbonseal/api';
import type { InstallationReport } from '@carbonseal/contract';
import type { Observable } from 'rxjs';

/** A connected wallet acting on the registry. One wallet is one CarbonSeal identity. */
export type Session = {
  readonly client: CarbonSealClient;
  readonly publicKey: string;
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
