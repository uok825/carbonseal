// SPDX-License-Identifier: Apache-2.0

import { ShieldCheck } from 'lucide-react';

import { useBackend, useRoute } from './lib/app-state';
import { BuyerPage } from './pages/Buyer';
import { OverviewPage } from './pages/Overview';
import { ProducerPage } from './pages/Producer';
import { RegistryPage } from './pages/Registry';
import { VerifierPage } from './pages/Verifier';

const NAV = [
  { path: '', label: 'Overview' },
  { path: 'producer', label: 'Producer' },
  { path: 'verifier', label: 'Verifier' },
  { path: 'buyer', label: 'Buyer' },
  { path: 'registry', label: 'Registry' },
] as const;

export const App = () => {
  const backend = useBackend();
  const [section = '', ...rest] = useRoute();

  const page = (() => {
    switch (section) {
      case 'producer':
        return <ProducerPage />;
      case 'verifier':
        return <VerifierPage />;
      case 'buyer':
        return <BuyerPage initialQuery={rest[0] ? decodeURIComponent(rest[0]) : undefined} />;
      case 'registry':
        return <RegistryPage />;
      default:
        return <OverviewPage />;
    }
  })();

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#/">
            <span className="brand-mark">
              <ShieldCheck size={14} strokeWidth={2.4} />
            </span>
            CarbonSeal
          </a>
          <nav className="nav">
            {NAV.map((item) => (
              <a key={item.path} href={`#/${item.path}`} aria-current={section === item.path ? 'page' : undefined}>
                {item.label}
              </a>
            ))}
          </nav>
          <div className="topbar-end">
            <span className="env-pill" title={backend.contractAddress}>
              <span className={`env-dot ${backend.mode === 'demo' ? 'demo' : ''}`} />
              <span className="label">
                {backend.networkLabel}
                {backend.mode === 'demo' && ' · demo data'}
              </span>
            </span>
          </div>
        </div>
      </header>
      <main className="main">
        {page}
        <footer className="footer">
          <span>CarbonSeal · prototype for the Midnight Buildathon · Apache-2.0</span>
          <span>
            {backend.mode === 'demo'
              ? 'Demo mode: the real contract runs in your browser with fictional data. No proofs are generated.'
              : `Connected to ${backend.networkLabel}. Every action is proven and submitted from your wallet.`}
          </span>
        </footer>
      </main>
    </>
  );
};
