// SPDX-License-Identifier: Apache-2.0

import { ArrowRight, Check, Globe, Lock, Sparkles } from 'lucide-react';

import { Stat } from '../components/ui';
import { navigate, useSnapshot } from '../lib/app-state';

const fmt = new Intl.NumberFormat('en-US');

const STEPS = [
  {
    title: 'Attest',
    body: 'An accredited verifier audits the installation report and publishes only its cryptographic commitment.',
  },
  {
    title: 'Prove',
    body: 'The producer proves, on their own machine, that the attested intensity is below the buyer’s threshold for each shipment.',
  },
  {
    title: 'Verify',
    body: 'The EU buyer checks the shipment on Midnight: threshold met, verifier accredited, tonnage within verified production.',
  },
] as const;

const PRIVATE = [
  'Fuel, power and process emissions',
  'Production volumes and remaining capacity',
  'Installation identity and site data',
  'Exact emission intensity, unless the producer chooses to share it',
];

const PUBLIC = [
  'Which verifiers are accredited',
  'A commitment to each audited report',
  'Shipment certificates: threshold, product, period, tonnes',
  'Total tonnes certified per report, never above verified production',
];

export const OverviewPage = () => {
  const snapshot = useSnapshot();
  const certifiedTonnes = snapshot?.certificates.reduce((sum, c) => sum + c.tonnes, 0n) ?? 0n;
  const activeReports = snapshot?.attestations.filter((a) => !a.revoked).length ?? 0;

  return (
    <>
      <section className="hero">
        <span className="hero-eyebrow">
          <Sparkles size={13} />
          EU CBAM · Built on Midnight
        </span>
        <h1>
          Prove your steel is low‑carbon.
          <br />
          <span className="soft">Reveal nothing else.</span>
        </h1>
        <p>
          CarbonSeal lets exporters prove a shipment’s embedded emissions are below a buyer’s threshold — backed by an
          accredited verifier — without handing over production data, energy mix or supplier lists.
        </p>
        <div className="actions">
          <button type="button" className="btn btn-primary btn-lg" onClick={() => navigate('producer')}>
            Open producer workspace
            <ArrowRight size={16} />
          </button>
          <button type="button" className="btn btn-secondary btn-lg" onClick={() => navigate('buyer')}>
            Verify a shipment
          </button>
        </div>
      </section>

      <section className="section">
        <div className="stats">
          <Stat label="Accredited verifiers" value={snapshot?.verifiers.length ?? '—'} />
          <Stat label="Attested reports" value={activeReports} />
          <Stat label="Certificates issued" value={fmt.format(Number(snapshot?.certificateCount ?? 0n))} />
          <Stat label="Tonnes certified" value={fmt.format(Number(certifiedTonnes))} />
        </div>
      </section>

      <section className="section how">
        <div className="section-head">
          <h2 className="section-title">How it works</h2>
        </div>
        <div className="grid grid-3">
          {STEPS.map((step, i) => (
            <div key={step.title} className="how-card">
              <div className="how-num">{String(i + 1).padStart(2, '0')}</div>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">The privacy boundary</h2>
          <span className="section-meta">Enforced by the Compact contract, not by policy</span>
        </div>
        <div className="boundary">
          <div className="private-side">
            <h3>
              <Lock size={15} /> Stays with the producer
            </h3>
            <ul>
              {PRIVATE.map((item) => (
                <li key={item}>
                  <Lock size={13} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="public-side">
            <h3>
              <Globe size={15} /> Published on Midnight
            </h3>
            <ul>
              {PUBLIC.map((item) => (
                <li key={item}>
                  <Check size={14} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </>
  );
};
