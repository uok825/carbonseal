// SPDX-License-Identifier: Apache-2.0

import { LocalRegistry, buildReport } from '@carbonseal/api';

import {
  DEMO_ATTESTED_REPORT,
  DEMO_BUYER,
  DEMO_PARTICIPANTS,
  DEMO_PENDING_REPORT,
  DEMO_SECRET_SEEDS,
  DEMO_SHIPMENTS,
} from '../demo/mock-data';
import { createAuditChannel } from './audit-channel';
import type { Backend, Participant, Role } from './types';

const seedKey = async (seed: string): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed)));

/**
 * Local demo: the real compiled contract runs in the browser (no proofs, no
 * network) and is seeded with mock participants through ordinary circuit calls.
 */
export const createDemoBackend = async (): Promise<Backend> => {
  const registry = new LocalRegistry('authority', await seedKey(DEMO_SECRET_SEEDS.authority));
  registry.register('verifier', await seedKey(DEMO_SECRET_SEEDS.verifier));
  registry.register('operator', await seedKey(DEMO_SECRET_SEEDS.operator));

  const participant = (role: Role): Participant => ({ role, ...DEMO_PARTICIPANTS[role], client: registry.clientFor(role) });
  const participants = {
    authority: participant('authority'),
    verifier: participant('verifier'),
    operator: participant('operator'),
  };
  const { authority, verifier, operator } = participants;
  const operatorPk = await operator.client.publicKey();

  await authority.client.addVerifier(await verifier.client.publicKey());

  const attested = buildReport(DEMO_ATTESTED_REPORT);
  const attestedCommitment = await operator.client.storeReport(attested);
  await verifier.client.attest({
    commitment: attestedCommitment,
    operatorPk,
    productCode: attested.productCode,
    period: attested.period,
  });
  for (const shipment of DEMO_SHIPMENTS) {
    await operator.client.certify({ ...shipment, commitment: attestedCommitment, buyerRef: DEMO_BUYER.eori });
  }

  const pending = buildReport(DEMO_PENDING_REPORT);
  const pendingCommitment = await operator.client.storeReport(pending);
  const audits = createAuditChannel([
    {
      commitment: pendingCommitment,
      operatorPk,
      operatorName: operator.name,
      report: pending,
      submittedAt: Date.now() - 1000 * 60 * 60 * 26,
    },
  ]);

  const directory = new Map<string, string>([
    [registry.snapshot.authority, authority.name],
    [await verifier.client.publicKey(), verifier.name],
    [operatorPk, operator.name],
  ]);

  return {
    mode: 'demo',
    networkLabel: 'Local simulator',
    contractAddress: registry.contractAddress,
    participants,
    audits,
    hints: { buyerName: DEMO_BUYER.name, buyerRef: DEMO_BUYER.eori, sampleShipment: DEMO_SHIPMENTS[0].shipmentRef },
    nameFor: (pk) => directory.get(pk),
  };
};
