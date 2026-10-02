// SPDX-License-Identifier: Apache-2.0
//
// ─── MOCK DATA ────────────────────────────────────────────────────────────────
// Fictional participants and figures used ONLY by the local demo mode
// (VITE_NETWORK_ID=demo). Nothing here is real, and nothing here is used when
// the app is connected to a Midnight network. Delete this folder once the
// demo is no longer needed.
// ──────────────────────────────────────────────────────────────────────────────

import type { ReportInput } from '@carbonseal/api';

export const DEMO_PARTICIPANTS = {
  authority: { name: 'CarbonSeal Registry', detail: 'Accreditation authority · demo' },
  verifier: { name: 'Meridian Verification', detail: 'Accredited verifier · demo' },
  operator: { name: 'Marmara Steel Works', detail: 'Steel producer, Kocaeli · demo' },
} as const;

export const DEMO_BUYER = { name: 'Rhine Metals GmbH', eori: 'DE7344019823' } as const;

/** Deterministic demo keys so the demo looks the same on every load. Never use for real. */
export const DEMO_SECRET_SEEDS = {
  authority: 'demo-only:authority',
  verifier: 'demo-only:verifier',
  operator: 'demo-only:operator',
} as const;

// Electric-arc-furnace coil: (156,000 + 48,000) t CO2e / 120,000 t = 1,700 kg/t.
export const DEMO_ATTESTED_REPORT: ReportInput = {
  installationRef: 'MSW-KOC-EAF-02',
  productCode: 72083900n,
  period: 2026n,
  directEmissionsTonnes: 156_000,
  indirectEmissionsTonnes: 48_000,
  productionTonnes: 120_000,
};

// Rebar from the same site, submitted for audit but not yet attested: 610 kg/t.
export const DEMO_PENDING_REPORT: ReportInput = {
  installationRef: 'MSW-KOC-EAF-01',
  productCode: 72142000n,
  period: 2026n,
  directEmissionsTonnes: 30_500,
  indirectEmissionsTonnes: 18_300,
  productionTonnes: 80_000,
};

export const DEMO_SHIPMENTS = [
  { shipmentRef: 'TR-2026-0417', tonnes: 2_500n, thresholdKgPerTonne: 1_900n },
  { shipmentRef: 'TR-2026-0452', tonnes: 4_000n, thresholdKgPerTonne: 1_850n },
] as const;
