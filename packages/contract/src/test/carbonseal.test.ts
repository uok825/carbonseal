// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';

import { type InstallationReport, pureCircuits } from '../managed/carbonseal/contract/index.js';
import { CarbonSealSimulator } from '../simulator.js';
import { bytesToHex } from '../witnesses.js';

const bytes = (seed: string): Uint8Array => {
  const out = new Uint8Array(32);
  out.set(new TextEncoder().encode(seed).slice(0, 32));
  return out;
};

const HOT_ROLLED_COIL = 72083900n;
const PERIOD = 2026n;

// 120 kt of coil at 1.4 t direct + 0.3 t indirect CO2e per tonne = 1,700 kg/t.
const report = (overrides: Partial<InstallationReport> = {}): InstallationReport => ({
  installationId: bytes('installation:iskenderun-eaf-2'),
  productCode: HOT_ROLLED_COIL,
  period: PERIOD,
  directEmissionsKg: 168_000_000n,
  indirectEmissionsKg: 36_000_000n,
  productionTonnes: 120_000n,
  salt: bytes('salt:7f3a'),
  ...overrides,
});

const setup = () => {
  const sim = new CarbonSealSimulator('authority', bytes('sk:authority'));
  const verifierPk = sim.register('verifier', bytes('sk:verifier'));
  const operatorPk = sim.register('operator', bytes('sk:operator'));
  sim.register('outsider', bytes('sk:outsider'));
  sim.addVerifier('authority', verifierPk);
  const commitment = sim.storeReport('operator', report());
  sim.attest('verifier', commitment, operatorPk, HOT_ROLLED_COIL, PERIOD);
  return { sim, verifierPk, operatorPk, commitment };
};

const shipment = (commitment: Uint8Array, id: string, tonnes: bigint, threshold = 1_900n) => ({
  shipmentId: bytes(id),
  commitment,
  thresholdKgPerTonne: threshold,
  tonnes,
  buyer: bytes('buyer:rotterdam-steel-gmbh'),
});

describe('deployment', () => {
  it('stores the authority public key, never the secret key', () => {
    const sim = new CarbonSealSimulator('authority', bytes('sk:authority'));
    const state = sim.ledger();
    expect(state.authority).toEqual(pureCircuits.publicKey(bytes('sk:authority')));
    expect(state.verifiers.isEmpty()).toBe(true);
    expect(state.certificateCount).toBe(0n);
  });
});

describe('verifier accreditation', () => {
  it('lets the authority add and remove verifiers', () => {
    const sim = new CarbonSealSimulator('authority', bytes('sk:authority'));
    const pk = sim.register('verifier', bytes('sk:verifier'));
    sim.addVerifier('authority', pk);
    expect(sim.ledger().verifiers.member(pk)).toBe(true);
    sim.removeVerifier('authority', pk);
    expect(sim.ledger().verifiers.member(pk)).toBe(false);
  });

  it('rejects accreditation by anyone else', () => {
    const sim = new CarbonSealSimulator('authority', bytes('sk:authority'));
    const pk = sim.register('verifier', bytes('sk:verifier'));
    expect(() => sim.addVerifier('verifier', pk)).toThrow('Only the registry authority can accredit verifiers');
  });
});

describe('attestation', () => {
  it('records the verifier, operator, product and period against the commitment', () => {
    const { sim, verifierPk, operatorPk, commitment } = setup();
    const attestation = sim.ledger().attestations.lookup(commitment);
    expect(attestation).toEqual({
      verifier: verifierPk,
      operator: operatorPk,
      productCode: HOT_ROLLED_COIL,
      period: PERIOD,
      revoked: false,
    });
    expect(sim.ledger().claimedTonnes.lookup(commitment)).toBe(0n);
  });

  it('rejects attestations from unaccredited parties', () => {
    const { sim, operatorPk } = setup();
    const commitment = sim.storeReport('operator', report({ salt: bytes('salt:other') }));
    expect(() => sim.attest('outsider', commitment, operatorPk, HOT_ROLLED_COIL, PERIOD)).toThrow(
      'Caller is not an accredited verifier',
    );
  });

  it('rejects attesting the same report twice', () => {
    const { sim, operatorPk, commitment } = setup();
    expect(() => sim.attest('verifier', commitment, operatorPk, HOT_ROLLED_COIL, PERIOD)).toThrow(
      'Report already attested',
    );
  });

  it('lets only the attesting verifier revoke', () => {
    const { sim, commitment } = setup();
    expect(() => sim.revoke('outsider', commitment)).toThrow('Only the attesting verifier can revoke');
    sim.revoke('verifier', commitment);
    expect(sim.ledger().attestations.lookup(commitment).revoked).toBe(true);
  });
});

describe('shipment certification', () => {
  it('certifies a shipment below the threshold', () => {
    const { sim, commitment } = setup();
    sim.certify('operator', shipment(commitment, 'TR-2026-0001', 2_500n));
    const cert = sim.ledger().certificates.lookup(bytes('TR-2026-0001'));
    expect(cert).toEqual({
      reportCommitment: commitment,
      productCode: HOT_ROLLED_COIL,
      period: PERIOD,
      thresholdKgPerTonne: 1_900n,
      tonnes: 2_500n,
      buyer: bytes('buyer:rotterdam-steel-gmbh'),
    });
    expect(sim.ledger().claimedTonnes.lookup(commitment)).toBe(2_500n);
    expect(sim.ledger().certificateCount).toBe(1n);
  });

  it('accepts a threshold exactly equal to the intensity', () => {
    const { sim, commitment } = setup();
    sim.certify('operator', shipment(commitment, 'TR-2026-0002', 10n, 1_700n));
    expect(sim.ledger().certificateCount).toBe(1n);
  });

  it('rejects a threshold below the real intensity', () => {
    const { sim, commitment } = setup();
    expect(() => sim.certify('operator', shipment(commitment, 'TR-2026-0003', 10n, 1_699n))).toThrow(
      'Emission intensity exceeds threshold',
    );
  });

  it('never certifies more tonnes than the verified production', () => {
    const { sim, commitment } = setup();
    sim.certify('operator', shipment(commitment, 'TR-2026-0004', 100_000n));
    sim.certify('operator', shipment(commitment, 'TR-2026-0005', 20_000n));
    expect(() => sim.certify('operator', shipment(commitment, 'TR-2026-0006', 1n))).toThrow(
      'Shipment exceeds verified production',
    );
    expect(sim.ledger().claimedTonnes.lookup(commitment)).toBe(120_000n);
  });

  it('rejects reusing a shipment id', () => {
    const { sim, commitment } = setup();
    sim.certify('operator', shipment(commitment, 'TR-2026-0007', 5n));
    expect(() => sim.certify('operator', shipment(commitment, 'TR-2026-0007', 5n))).toThrow(
      'Shipment already certified',
    );
  });

  it('rejects zero-tonne shipments', () => {
    const { sim, commitment } = setup();
    expect(() => sim.certify('operator', shipment(commitment, 'TR-2026-0008', 0n))).toThrow(
      'Shipment must be at least one tonne',
    );
  });

  it('rejects reports that were never attested', () => {
    const { sim } = setup();
    const unattested = sim.storeReport('operator', report({ salt: bytes('salt:unattested') }));
    expect(() => sim.certify('operator', shipment(unattested, 'TR-2026-0009', 5n))).toThrow(
      'Report has not been attested',
    );
  });

  it('rejects revoked attestations', () => {
    const { sim, commitment } = setup();
    sim.revoke('verifier', commitment);
    expect(() => sim.certify('operator', shipment(commitment, 'TR-2026-0010', 5n))).toThrow(
      'Attestation has been revoked',
    );
  });

  it('lets only the reporting operator certify', () => {
    const { sim, commitment } = setup();
    expect(() => sim.certify('outsider', shipment(commitment, 'TR-2026-0011', 5n))).toThrow(
      'Only the reporting operator can certify shipments',
    );
  });

  it('rejects a private report that was altered after attestation', () => {
    const { sim, commitment } = setup();
    // The operator swaps in rosier numbers under the attested commitment.
    const tampered = report({ directEmissionsKg: 1n });
    const state = sim.privateStateOf('operator');
    (state.reports as Record<string, InstallationReport>)[bytesToHex(commitment)] = tampered;
    expect(() => sim.certify('operator', shipment(commitment, 'TR-2026-0012', 5n, 100n))).toThrow(
      'Private report does not match the attested commitment',
    );
  });
});

describe('privacy boundary', () => {
  it('keeps installation data out of the public ledger', () => {
    const { sim, commitment } = setup();
    sim.certify('operator', shipment(commitment, 'TR-2026-0013', 2_500n));
    const state = sim.ledger();
    const publicValues = JSON.stringify(
      {
        attestations: [...state.attestations],
        claimed: [...state.claimedTonnes],
        certificates: [...state.certificates],
      },
      (_key, value: unknown) =>
        typeof value === 'bigint' ? value.toString() : value instanceof Uint8Array ? bytesToHex(value) : value,
    );
    const secrets = report();
    for (const secret of [
      secrets.directEmissionsKg,
      secrets.indirectEmissionsKg,
      secrets.productionTonnes,
      secrets.directEmissionsKg + secrets.indirectEmissionsKg,
    ]) {
      expect(publicValues).not.toContain(secret.toString());
    }
    expect(publicValues).not.toContain(bytesToHex(secrets.installationId));
    expect(publicValues).not.toContain(bytesToHex(secrets.salt));
  });

  it('binds the commitment to every report field', () => {
    const base = pureCircuits.reportCommitment(report());
    expect(pureCircuits.reportCommitment(report({ productionTonnes: 120_001n }))).not.toEqual(base);
    expect(pureCircuits.reportCommitment(report({ salt: bytes('salt:other') }))).not.toEqual(base);
    expect(pureCircuits.reportCommitment(report())).toEqual(base);
  });
});
