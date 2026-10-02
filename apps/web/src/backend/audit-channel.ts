// SPDX-License-Identifier: Apache-2.0

import type { InstallationReport } from '@carbonseal/contract';
import { BehaviorSubject } from 'rxjs';

import type { AuditChannel, AuditPackage } from './types';

/** In-browser hand-off between operator and verifier. Stands in for e-mail or an audit portal. */
export const createAuditChannel = (initial: readonly AuditPackage[] = []): AuditChannel => {
  const requests = new BehaviorSubject<readonly AuditPackage[]>(initial);
  return {
    requests$: requests,
    submit: (pkg) => requests.next([...requests.value.filter((r) => r.commitment !== pkg.commitment), pkg]),
    dismiss: (commitment) => requests.next(requests.value.filter((r) => r.commitment !== commitment)),
  };
};

type Serialized = Omit<AuditPackage, 'report'> & { report: Record<string, string> };

const BYTE_FIELDS = new Set(['installationId', 'salt']);

/** Serializes an audit package for copy/paste between devices. */
export const encodeAuditPackage = (pkg: AuditPackage): string =>
  JSON.stringify({
    ...pkg,
    report: Object.fromEntries(
      Object.entries(pkg.report).map(([k, v]) => [
        k,
        v instanceof Uint8Array ? Array.from(v, (b) => b.toString(16).padStart(2, '0')).join('') : String(v),
      ]),
    ),
  } satisfies Serialized);

export const decodeAuditPackage = (text: string): AuditPackage => {
  const raw = JSON.parse(text) as Serialized;
  const r = raw.report;
  const field = (name: string): string => {
    const value = r[name];
    if (value === undefined) throw new Error(`Audit package is missing report.${name}`);
    return value;
  };
  const bytes = (name: string): Uint8Array =>
    Uint8Array.from(field(name).match(/../g) ?? [], (h) => parseInt(h, 16));
  const report: InstallationReport = {
    installationId: bytes('installationId'),
    productCode: BigInt(field('productCode')),
    period: BigInt(field('period')),
    directEmissionsKg: BigInt(field('directEmissionsKg')),
    indirectEmissionsKg: BigInt(field('indirectEmissionsKg')),
    productionTonnes: BigInt(field('productionTonnes')),
    salt: bytes('salt'),
  };
  for (const name of BYTE_FIELDS) if (bytes(name).length !== 32) throw new Error(`report.${name} must be 32 bytes`);
  return { ...raw, report };
};
