// SPDX-License-Identifier: Apache-2.0

import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { buildReport, formatCnCode, intensityKgPerTonne, meetsThreshold } from '../cbam.js';
import { bytesToLabel, fromHex, labelToBytes, toHex } from '../encoding.js';
import { LocalRegistry } from '../local.js';

const key = (seed: number): Uint8Array => new Uint8Array(32).fill(seed);

const coilReport = () =>
  buildReport(
    {
      installationRef: 'TR-ISK-EAF-02',
      productCode: 72083900n,
      period: 2026n,
      directEmissionsTonnes: 168_000,
      indirectEmissionsTonnes: 36_000,
      productionTonnes: 120_000,
    },
    key(9),
  );

describe('encoding', () => {
  it('round-trips hex', () => {
    const bytes = new Uint8Array([0, 1, 171, 255]);
    expect(toHex(bytes)).toBe('0001abff');
    expect(fromHex('0x0001abff')).toEqual(bytes);
    expect(() => fromHex('abc')).toThrow('Invalid hex string');
  });

  it('round-trips short labels through Bytes<32>', () => {
    expect(bytesToLabel(labelToBytes('TR-2026-0001'))).toBe('TR-2026-0001');
    expect(bytesToLabel(new Uint8Array(32))).toBeUndefined();
    expect(bytesToLabel(key(0xff))).toBeUndefined();
    expect(() => labelToBytes('x'.repeat(33))).toThrow('longer than 32 bytes');
  });
});

describe('cbam helpers', () => {
  it('computes intensity and mirrors the contract threshold check', () => {
    const report = coilReport();
    expect(intensityKgPerTonne(report)).toBe(1700);
    expect(meetsThreshold(report, 1700n)).toBe(true);
    expect(meetsThreshold(report, 1699n)).toBe(false);
  });

  it('formats CN codes', () => {
    expect(formatCnCode(72083900n)).toBe('7208 39 00');
  });

  it('rejects invalid production figures', () => {
    expect(() =>
      buildReport({
        installationRef: 'x',
        productCode: 1n,
        period: 2026n,
        directEmissionsTonnes: 1,
        indirectEmissionsTonnes: 1,
        productionTonnes: 0,
      }),
    ).toThrow('positive whole number');
  });
});

describe('LocalRegistry', () => {
  it('runs the full attest → certify flow and publishes only public facts', async () => {
    const registry = new LocalRegistry('authority', key(1));
    registry.register('verifier', key(2));
    registry.register('operator', key(3));
    const authority = registry.clientFor('authority');
    const verifier = registry.clientFor('verifier');
    const operator = registry.clientFor('operator');

    await authority.addVerifier(await verifier.publicKey());
    const commitment = await operator.storeReport(coilReport());
    await verifier.attest({
      commitment,
      operatorPk: await operator.publicKey(),
      productCode: 72083900n,
      period: 2026n,
    });
    await operator.certify({
      shipmentRef: 'TR-2026-0001',
      commitment,
      thresholdKgPerTonne: 1900n,
      tonnes: 2500n,
      buyerRef: 'DE123456789',
    });

    const snapshot = await firstValueFrom(operator.state$);
    expect(snapshot.verifiers).toEqual([await verifier.publicKey()]);
    expect(snapshot.attestations).toHaveLength(1);
    expect(snapshot.attestations[0]?.claimedTonnes).toBe(2500n);
    expect(snapshot.certificates[0]).toMatchObject({
      shipmentLabel: 'TR-2026-0001',
      buyerLabel: 'DE123456789',
      thresholdKgPerTonne: 1900n,
      tonnes: 2500n,
      reportCommitment: commitment,
    });

    expect(await operator.reports()).toHaveLength(1);
    expect(await verifier.reports()).toHaveLength(0);
  });

  it('surfaces contract rejections as errors and leaves state untouched', async () => {
    const registry = new LocalRegistry('authority', key(1));
    registry.register('operator', key(3));
    const operator = registry.clientFor('operator');
    const before = registry.snapshot;
    await expect(operator.addVerifier(await operator.publicKey())).rejects.toThrow(
      'Only the registry authority can accredit verifiers',
    );
    expect(registry.snapshot).toBe(before);
  });
});
