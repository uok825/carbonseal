// SPDX-License-Identifier: Apache-2.0

import { ShieldCheck, Wallet } from 'lucide-react';

import { Button } from './components/ui';
import { useApp, useRoute } from './lib/app-state';
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

const short = (hex: string) => `${hex.slice(0, 4)}…${hex.slice(-4)}`;

export const App = () => {
  const { network, contractAddress, session, connect, connecting } = useApp();
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
            <span className="env-pill" title={`Registry ${contractAddress}`}>
              <span className="env-dot" />
              <span className="label">{network.label}</span>
            </span>
            {session ? (
              <span className="env-pill mono" title={session.publicKey}>
                <Wallet size={13} />
                <span className="label">{short(session.publicKey)}</span>
              </span>
            ) : (
              <Button size="sm" variant="primary" loading={connecting} onClick={() => void connect()}>
                Connect wallet
              </Button>
            )}
          </div>
        </div>
      </header>
      <main className="main">
        {page}
        <footer className="footer">
          <span>CarbonSeal · prototype for the Midnight Buildathon · Apache-2.0</span>
          <span className="mono" title={contractAddress}>
            {network.label} registry {short(contractAddress)}
          </span>
        </footer>
      </main>
    </>
  );
};
