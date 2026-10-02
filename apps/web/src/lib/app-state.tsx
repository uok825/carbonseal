// SPDX-License-Identifier: Apache-2.0

import { type CarbonSealClient, type RegistrySnapshot, type StoredReport, watchRegistry } from '@carbonseal/api';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { CheckCircle2, XCircle } from 'lucide-react';
import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Observable } from 'rxjs';

import { createAuditChannel } from '../backend/audit-channel';
import type { AuditChannel, AuditPackage, Session } from '../backend/types';
import { config } from '../config';

type AppState = {
  readonly network: typeof config.network;
  readonly contractAddress: string;
  /** Live public state, read from the indexer without a wallet. */
  readonly registry$: Observable<RegistrySnapshot>;
  readonly audits: AuditChannel;
  readonly session: Session | undefined;
  readonly connecting: boolean;
  connect(): Promise<void>;
};

const AppContext = createContext<AppState | null>(null);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const toast = useToast();
  const [session, setSession] = useState<Session>();
  const [connecting, setConnecting] = useState(false);
  const { network, contractAddress } = config;

  const registry$ = useMemo(
    () => watchRegistry(indexerPublicDataProvider(network.indexer, network.indexerWS), contractAddress),
    [network, contractAddress],
  );
  const audits = useMemo(() => createAuditChannel(`carbonseal:audits:${contractAddress}`), [contractAddress]);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const { connectSession } = await import('../backend/wallet');
      setSession(await connectSession(network.id, contractAddress));
      toast({ tone: 'success', title: 'Wallet connected', body: `Joined the ${network.label} registry.` });
    } catch (error) {
      toast({ tone: 'error', title: 'Could not connect wallet', body: errorMessage(error) });
    } finally {
      setConnecting(false);
    }
  }, [network, contractAddress, toast]);

  const value = useMemo(
    () => ({ network, contractAddress, registry$, audits, session, connecting, connect }),
    [network, contractAddress, registry$, audits, session, connecting, connect],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = (): AppState => {
  const app = useContext(AppContext);
  if (app === null) throw new Error('useApp outside AppProvider');
  return app;
};

type Loadable<T> = { value: T | undefined; error: unknown };

export const useObservableState = <T,>(source: Observable<T>): Loadable<T> => {
  const [state, setState] = useState<Loadable<T>>({ value: undefined, error: undefined });
  useEffect(() => {
    setState({ value: undefined, error: undefined });
    const sub = source.subscribe({
      next: (value) => setState({ value, error: undefined }),
      error: (error: unknown) => setState((s) => ({ ...s, error })),
    });
    return () => sub.unsubscribe();
  }, [source]);
  return state;
};

export const useObservable = <T,>(source: Observable<T>): T | undefined => useObservableState(source).value;

export const useRegistry = (): Loadable<RegistrySnapshot> => useObservableState(useApp().registry$);

export const useSnapshot = (): RegistrySnapshot | undefined => useRegistry().value;

export const useAuditRequests = (): readonly AuditPackage[] => useObservable(useApp().audits.requests$) ?? [];

/** Labels the connected wallet's own key; every other party is shown by its key. */
export const useNameFor = (): ((publicKey: string) => string | undefined) => {
  const { session } = useApp();
  return useCallback((pk: string) => (session && pk === session.publicKey ? 'You' : undefined), [session]);
};

/** Private reports held by a client; refreshed whenever the public ledger changes or on demand. */
export const usePrivateReports = (client: CarbonSealClient): [readonly StoredReport[], () => void] => {
  const snapshot = useSnapshot();
  const [reports, setReports] = useState<readonly StoredReport[]>([]);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    void client.reports().then((r) => live && setReports(r));
    return () => {
      live = false;
    };
  }, [client, snapshot, version]);
  return [reports, useCallback(() => setVersion((v) => v + 1), [])];
};

// ── Toasts ────────────────────────────────────────────────────────────

type Toast = { id: number; tone: 'success' | 'error'; title: string; body?: string };

const ToastContext = createContext<(toast: Omit<Toast, 'id'>) => void>(() => undefined);

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { ...toast, id }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            <span className="toast-icon">{t.tone === 'success' ? <CheckCircle2 size={18} /> : <XCircle size={18} />}</span>
            <div>
              <div className="toast-title">{t.title}</div>
              {t.body && <div className="toast-body">{t.body}</div>}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => useContext(ToastContext);

/** Contract assertion messages arrive wrapped by the runtime; surface just the reason. */
export const errorMessage = (error: unknown): string => {
  const text = error instanceof Error ? error.message : String(error);
  const match = /failed assert: (.*)$/i.exec(text);
  return match?.[1] ?? text;
};

// ── Routing ───────────────────────────────────────────────────────────

export const useRoute = (): string[] => {
  const read = () => window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onHash = () => {
      setRoute(read());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route;
};

export const navigate = (path: string) => {
  window.location.hash = `/${path}`;
};
