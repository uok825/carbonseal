// SPDX-License-Identifier: Apache-2.0

import type { InstallationReport } from '@carbonseal/contract';

import { labelToBytes, randomBytes } from './encoding.js';

export type CbamProduct = {
  readonly code: bigint;
  readonly name: string;
  readonly sector: 'Iron & steel' | 'Aluminium' | 'Cement';
};

/** CBAM goods supported by the prototype, keyed by EU Combined Nomenclature code. */
export const CBAM_PRODUCTS: readonly CbamProduct[] = [
  { code: 72083900n, name: 'Hot-rolled coil, < 3 mm', sector: 'Iron & steel' },
  { code: 72142000n, name: 'Reinforcing bar (rebar)', sector: 'Iron & steel' },
  { code: 72131000n, name: 'Wire rod', sector: 'Iron & steel' },
  { code: 76011000n, name: 'Unwrought aluminium', sector: 'Aluminium' },
  { code: 25232900n, name: 'Portland cement', sector: 'Cement' },
];

export const productName = (code: bigint): string =>
  CBAM_PRODUCTS.find((p) => p.code === code)?.name ?? `CN ${formatCnCode(code)}`;

export const formatCnCode = (code: bigint): string => {
  const s = code.toString().padStart(8, '0');
  return `${s.slice(0, 4)} ${s.slice(4, 6)} ${s.slice(6, 8)}`;
};

export type ReportInput = {
  readonly installationRef: string;
  readonly productCode: bigint;
  readonly period: bigint;
  readonly directEmissionsTonnes: number;
  readonly indirectEmissionsTonnes: number;
  readonly productionTonnes: number;
};

const toKg = (tonnes: number): bigint => BigInt(Math.round(tonnes * 1000));

/** Builds the private report an operator hands to its verifier, with a fresh blinding salt. */
export const buildReport = (input: ReportInput, salt: Uint8Array = randomBytes(32)): InstallationReport => {
  if (!Number.isInteger(input.productionTonnes) || input.productionTonnes <= 0) {
    throw new Error('Production must be a positive whole number of tonnes');
  }
  if (input.directEmissionsTonnes < 0 || input.indirectEmissionsTonnes < 0) {
    throw new Error('Emissions cannot be negative');
  }
  return {
    installationId: labelToBytes(input.installationRef),
    productCode: input.productCode,
    period: input.period,
    directEmissionsKg: toKg(input.directEmissionsTonnes),
    indirectEmissionsKg: toKg(input.indirectEmissionsTonnes),
    productionTonnes: BigInt(input.productionTonnes),
    salt,
  };
};

/** Embedded emissions in kg CO2e per tonne of product. Computed locally; never published. */
export const intensityKgPerTonne = (report: InstallationReport): number =>
  Number(report.directEmissionsKg + report.indirectEmissionsKg) / Number(report.productionTonnes);

/** Mirrors the contract's check so the UI can explain a rejection before proving. */
export const meetsThreshold = (report: InstallationReport, thresholdKgPerTonne: bigint): boolean =>
  report.directEmissionsKg + report.indirectEmissionsKg <= thresholdKgPerTonne * report.productionTonnes;

export const formatTonnes = (tonnes: bigint | number): string =>
  `${new Intl.NumberFormat('en-US').format(typeof tonnes === 'bigint' ? Number(tonnes) : tonnes)} t`;

export const formatIntensity = (kgPerTonne: bigint | number): string =>
  `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(kgPerTonne))} kg CO₂e/t`;
