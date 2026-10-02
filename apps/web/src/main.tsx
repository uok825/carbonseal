// SPDX-License-Identifier: Apache-2.0

import './globals';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './styles/tokens.css';
import './styles/app.css';

import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { Loader2, ShieldCheck, Wallet } from 'lucide-react';
import { type ReactNode, StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import type { Backend } from './backend/types';
import { Button, Card, Field } from './components/ui';
import { BackendProvider, ToastProvider, errorMessage } from './lib/app-state';

const networkId = import.meta.env.VITE_NETWORK_ID ?? 'demo';

const Splash = ({ children }: { children: ReactNode }) => (
  <div className="connect">
    <Card className="card-pad">{children}</Card>
  </div>
);

const DemoBoot = () => {
  const [backend, setBackend] = useState<Backend>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    void import('./backend/demo').then(({ createDemoBackend }) =>
      createDemoBackend().then(setBackend, (e: unknown) => setError(errorMessage(e))),
    );
  }, []);
  if (error) return <Splash>Could not start the demo: {error}</Splash>;
  if (!backend)
    return (
      <Splash>
        <div className="check-row muted">
          <Loader2 size={16} className="spin" /> Loading contract…
        </div>
      </Splash>
    );
  return (
    <BackendProvider backend={backend}>
      <App />
    </BackendProvider>
  );
};

const NetworkBoot = () => {
  const [backend, setBackend] = useState<Backend>();
  const [address, setAddress] = useState(import.meta.env.VITE_CONTRACT_ADDRESS ?? '');
  const [busy, setBusy] = useState<'join' | 'deploy' | null>(null);
  const [error, setError] = useState<string>();

  const connect = async (mode: 'join' | 'deploy') => {
    setBusy(mode);
    setError(undefined);
    try {
      const { createNetworkBackend } = await import('./backend/network');
      setBackend(await createNetworkBackend(networkId, mode === 'join' ? address.trim() : undefined));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  if (backend)
    return (
      <BackendProvider backend={backend}>
        <App />
      </BackendProvider>
    );

  return (
    <Splash>
      <div className="brand" style={{ marginBottom: 18 }}>
        <span className="brand-mark">
          <ShieldCheck size={14} strokeWidth={2.4} />
        </span>
        CarbonSeal
      </div>
      <div className="modal-title">Connect to {networkId}</div>
      <p className="muted" style={{ margin: '6px 0 20px' }}>
        Use a Midnight wallet (Lace or 1AM) with a local proof server. Join an existing registry, or deploy a new one
        and become its authority.
      </p>
      <Field label="Registry contract address">
        <input className="input mono" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="0200…" />
      </Field>
      <div className="actions" style={{ marginTop: 16 }}>
        <Button
          variant="primary"
          icon={<Wallet size={15} />}
          disabled={address.trim() === '' || busy !== null}
          loading={busy === 'join'}
          onClick={() => void connect('join')}
        >
          Connect & join
        </Button>
        <Button disabled={busy !== null} loading={busy === 'deploy'} onClick={() => void connect('deploy')}>
          Deploy new registry
        </Button>
      </div>
      {error && (
        <div className="banner" style={{ marginTop: 16 }}>
          {error}
        </div>
      )}
    </Splash>
  );
};

if (networkId !== 'demo') setNetworkId(networkId);

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <ToastProvider>{networkId === 'demo' ? <DemoBoot /> : <NetworkBoot />}</ToastProvider>
  </StrictMode>,
);
