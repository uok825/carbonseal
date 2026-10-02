// SPDX-License-Identifier: Apache-2.0

import type { CarbonSealClient, RegistrySnapshot, StoredReport } from '@carbonseal/api';
import { CheckCircle2, XCircle } from 'lucide-react';
import { type ReactNode, createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Observable } from 'rxjs';

import type { AuditPackage, Backend } from '../backend/types';

const BackendContext = createContext<Backend | null>(null);

export const BackendProvider = ({ backend, children }: { backend: Backend; children: ReactNode }) => (
  <BackendContext.Provider value={backend}>{children}</BackendContext.Provider>
);

export const useBackend = (): Backend => {
  const backend = useContext(BackendContext);
  if (backend === null) throw new Error('useBackend outside BackendProvider');
  return backend;
};

export const useObservable = <T,>(source: Observable<T>): T | undefined => {
  const [value, setValue] = useState<T>();
  useEffect(() => {
    const sub = source.subscribe(setValue);
    return () => sub.unsubscribe();
  }, [source]);
  return value;
};

export const useSnapshot = (): RegistrySnapshot | undefined =>
  useObservable(useBackend().participants.operator.client.state$);

export const useAuditRequests = (): readonly AuditPackage[] => useObservable(useBackend().audits.requests$) ?? [];

/** Private reports held by a client; refreshed whenever the public ledger changes or on demand. */
export const usePrivateReports = (client: CarbonSealClient): [readonly StoredReport[], () => void] => {
  const snapshot = useObservable(client.state$);
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

export const usePublicKey = (client: CarbonSealClient): string | undefined => {
  const [pk, setPk] = useState<string>();
  useEffect(() => {
    void client.publicKey().then(setPk);
  }, [client]);
  return pk;
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
