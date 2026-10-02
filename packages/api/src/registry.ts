// SPDX-License-Identifier: Apache-2.0

import type { Ledger } from '@carbonseal/contract';

import { bytesToLabel, toHex } from './encoding.js';

export type AttestationView = {
  readonly commitment: string;
  readonly verifier: string;
  readonly operator: string;
  readonly productCode: bigint;
  readonly period: bigint;
  readonly revoked: boolean;
  readonly claimedTonnes: bigint;
};

export type CertificateView = {
  readonly shipmentId: string;
  readonly shipmentLabel: string | undefined;
  readonly reportCommitment: string;
  readonly productCode: bigint;
  readonly period: bigint;
  readonly thresholdKgPerTonne: bigint;
  readonly tonnes: bigint;
  readonly buyer: string;
  readonly buyerLabel: string | undefined;
};

/** The complete public state of a CarbonSeal registry, with byte fields as hex. */
export type RegistrySnapshot = {
  readonly authority: string;
  readonly verifiers: readonly string[];
  readonly attestations: readonly AttestationView[];
  readonly certificates: readonly CertificateView[];
  readonly certificateCount: bigint;
};

export const snapshotFromLedger = (ledger: Ledger): RegistrySnapshot => ({
  authority: toHex(ledger.authority),
  verifiers: [...ledger.verifiers].map(toHex),
  attestations: [...ledger.attestations].map(([commitment, a]) => ({
    commitment: toHex(commitment),
    verifier: toHex(a.verifier),
    operator: toHex(a.operator),
    productCode: a.productCode,
    period: a.period,
    revoked: a.revoked,
    claimedTonnes: ledger.claimedTonnes.member(commitment) ? ledger.claimedTonnes.lookup(commitment) : 0n,
  })),
  certificates: [...ledger.certificates].map(([id, c]) => ({
    shipmentId: toHex(id),
    shipmentLabel: bytesToLabel(id),
    reportCommitment: toHex(c.reportCommitment),
    productCode: c.productCode,
    period: c.period,
    thresholdKgPerTonne: c.thresholdKgPerTonne,
    tonnes: c.tonnes,
    buyer: toHex(c.buyer),
    buyerLabel: bytesToLabel(c.buyer),
  })),
  certificateCount: ledger.certificateCount,
});

export const findCertificate = (snapshot: RegistrySnapshot, shipmentHex: string): CertificateView | undefined =>
  snapshot.certificates.find((c) => c.shipmentId === shipmentHex);

export const findAttestation = (snapshot: RegistrySnapshot, commitmentHex: string): AttestationView | undefined =>
  snapshot.attestations.find((a) => a.commitment === commitmentHex);
