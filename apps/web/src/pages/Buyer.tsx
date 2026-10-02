// SPDX-License-Identifier: Apache-2.0

import {
  type CertificateView,
  type RegistrySnapshot,
  formatCnCode,
  formatIntensity,
  formatTonnes,
  labelToBytes,
  productName,
  toHex,
} from '@carbonseal/api';
import { AlertTriangle, Check, EyeOff, Search, SearchX, ShieldCheck, ShieldX } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';

import { Badge, Empty, Hash, PageHead, PublicTag } from '../components/ui';
import { navigate, useBackend, useSnapshot } from '../lib/app-state';

const findByReference = (snapshot: RegistrySnapshot, query: string): CertificateView | undefined => {
  const q = query.trim();
  if (q === '') return undefined;
  let hex: string | undefined;
  try {
    hex = toHex(labelToBytes(q));
  } catch {
    hex = undefined;
  }
  return snapshot.certificates.find((c) => c.shipmentId === hex || c.shipmentId === q.toLowerCase());
};

export const BuyerPage = ({ initialQuery }: { initialQuery?: string }) => {
  const backend = useBackend();
  const snapshot = useSnapshot();
  const [input, setInput] = useState(initialQuery ?? backend.hints?.sampleShipment ?? '');
  const [query, setQuery] = useState(initialQuery ?? '');
  const [eori, setEori] = useState(backend.hints?.buyerRef ?? '');

  useEffect(() => {
    if (initialQuery !== undefined) {
      setInput(initialQuery);
      setQuery(initialQuery);
    }
  }, [initialQuery]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    navigate(`buyer/${encodeURIComponent(input.trim())}`);
    setQuery(input.trim());
  };

  const result = snapshot && query ? findByReference(snapshot, query) : undefined;
  const mine = snapshot?.certificates.filter((c) => eori.trim() !== '' && c.buyerLabel === eori.trim()) ?? [];

  return (
    <>
      <PageHead
        eyebrow={
          <>
            <ShieldCheck size={13} /> Buyer verification
          </>
        }
        title="Verify a shipment"
        description="Check a shipment’s emission certificate directly against the Midnight ledger. No account, no documents, no trust in the supplier required."
      />

      <form className="search" onSubmit={submit}>
        <Search size={18} />
        <input
          className="input"
          placeholder="Shipment reference, e.g. TR-2026-0417"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-label="Shipment reference"
        />
        <button type="submit" className="btn btn-primary">
          Verify
        </button>
      </form>

      {query && snapshot && (
        <section className="section">
          {result ? (
            <CertificateResult certificate={result} snapshot={snapshot} />
          ) : (
            <Empty icon={<SearchX size={22} />} title={`No certificate for “${query}”`}>
              The shipment has not been certified on this registry.
            </Empty>
          )}
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Certificates addressed to you</h2>
          <input
            className="input mono"
            style={{ maxWidth: 220, height: 30 }}
            placeholder="Your EORI"
            value={eori}
            onChange={(e) => setEori(e.target.value)}
            aria-label="Your EORI number"
          />
        </div>
        {mine.length === 0 ? (
          <Empty icon={<Search size={22} />} title="No certificates for this EORI" />
        ) : (
          <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Shipment</th>
                    <th>Product</th>
                    <th>Supplier</th>
                    <th className="num">Quantity</th>
                    <th className="num">Threshold met</th>
                  </tr>
                </thead>
                <tbody>
                  {mine.map((c) => {
                    const attestation = snapshot?.attestations.find((a) => a.commitment === c.reportCommitment);
                    return (
                      <tr
                        key={c.shipmentId}
                        style={{ cursor: 'pointer' }}
                        onClick={() => navigate(`buyer/${encodeURIComponent(c.shipmentLabel ?? c.shipmentId)}`)}
                      >
                        <td className="mono">{c.shipmentLabel ?? c.shipmentId.slice(0, 12)}</td>
                        <td>{productName(c.productCode)}</td>
                        <td>{attestation ? (backend.nameFor(attestation.operator) ?? 'Unknown operator') : '—'}</td>
                        <td className="num">{formatTonnes(c.tonnes)}</td>
                        <td className="num">≤ {formatIntensity(c.thresholdKgPerTonne)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
        )}
      </section>
    </>
  );
};

const CertificateResult = ({ certificate: c, snapshot }: { certificate: CertificateView; snapshot: RegistrySnapshot }) => {
  const backend = useBackend();
  const attestation = snapshot.attestations.find((a) => a.commitment === c.reportCommitment);
  const verifierAccredited = attestation !== undefined && snapshot.verifiers.includes(attestation.verifier);
  const sound = attestation !== undefined && !attestation.revoked && verifierAccredited;

  return (
    <div className="grid" style={{ gap: 24 }}>
      <div>
        <div className="verdict">
          <div className={`verdict-seal ${sound ? '' : 'bad'}`}>
            {sound ? <ShieldCheck size={28} /> : <ShieldX size={28} />}
          </div>
          <div style={{ flex: 1 }}>
            <h2>
              {sound
                ? `Meets ${formatIntensity(c.thresholdKgPerTonne)}`
                : 'Certificate no longer backed by an active attestation'}
            </h2>
            <p>
              Shipment <span className="mono">{c.shipmentLabel ?? c.shipmentId}</span> · {formatTonnes(c.tonnes)} of{' '}
              {productName(c.productCode).toLowerCase()}
            </p>
          </div>
          <PublicTag>Read from ledger</PublicTag>
        </div>
        <div style={{ marginTop: 36 }}>
          <dl className="kv">
            <div>
              <dt>Product</dt>
              <dd>
                {productName(c.productCode)}
                <div className="subtle mono" style={{ fontSize: 12 }}>
                  CN {formatCnCode(c.productCode)}
                </div>
              </dd>
            </div>
            <div>
              <dt>Reporting period</dt>
              <dd>{c.period.toString()}</dd>
            </div>
            <div>
              <dt>Buyer</dt>
              <dd className="mono">{c.buyerLabel ?? <Hash value={c.buyer} />}</dd>
            </div>
            <div>
              <dt>Supplier</dt>
              <dd>{attestation ? (backend.nameFor(attestation.operator) ?? <Hash value={attestation.operator} />) : '—'}</dd>
            </div>
            <div>
              <dt>Verifier</dt>
              <dd style={{ display: 'grid', gap: 4, justifyItems: 'start' }}>
                {attestation ? (backend.nameFor(attestation.verifier) ?? <Hash value={attestation.verifier} />) : '—'}
                {verifierAccredited ? (
                  <Badge tone="success" dot>
                    Accredited
                  </Badge>
                ) : (
                  <Badge tone="danger" dot>
                    Not accredited
                  </Badge>
                )}
              </dd>
            </div>
            <div>
              <dt>Attestation</dt>
              <dd style={{ display: 'grid', gap: 4, justifyItems: 'start' }}>
                <Hash value={c.reportCommitment} />
                {attestation?.revoked && (
                  <Badge tone="danger" dot>
                    Revoked
                  </Badge>
                )}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="grid grid-2" style={{ gap: 48, marginTop: 24 }}>
        <div>
          <div className="card-title" style={{ marginBottom: 12 }}>
            What this proves
          </div>
          <ul className="list-plain">
            <li>
              <Check size={14} color="var(--success)" />
              The producer’s audited emission intensity is at or below {formatIntensity(c.thresholdKgPerTonne)}.
            </li>
            <li>
              <Check size={14} color="var(--success)" />
              The report was attested by a verifier the registry accredits.
            </li>
            <li>
              <Check size={14} color="var(--success)" />
              All shipments certified against this report fit within its verified production.
            </li>
          </ul>
        </div>
        <div>
          <div className="card-title" style={{ marginBottom: 12 }}>
            What stays private
          </div>
          <ul className="list-plain">
            <li>
              <EyeOff size={14} color="var(--text-3)" />
              The exact intensity, emissions and production volume.
            </li>
            <li>
              <EyeOff size={14} color="var(--text-3)" />
              The installation, its energy mix and its suppliers.
            </li>
            <li>
              <EyeOff size={14} color="var(--text-3)" />
              How much verified capacity the producer has left.
            </li>
          </ul>
        </div>
      </div>

      {!sound && (
        <div className="banner danger">
          <AlertTriangle size={15} /> Do not rely on this certificate until the producer re-certifies under an active
          attestation.
        </div>
      )}
    </div>
  );
};
