// SPDX-License-Identifier: Apache-2.0
//
// Development only (VITE_WALLET_BRIDGE=1): registers a DApp Connector wallet
// backed by apps/cli/src/bridge.ts, which runs a synced CLI wallet on the
// server. Calls go to /bridge on this origin, which Vite proxies to the bridge.

import type { ConnectedAPI, InitialAPI } from '@midnight-ntwrk/dapp-connector-api';

const call = async (method: string, ...params: unknown[]): Promise<unknown> => {
  const res = await fetch('/bridge/rpc', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ method, params }),
  });
  const body = (await res.json()) as { result?: unknown; error?: string };
  if (!res.ok || body.error) throw new Error(`Wallet bridge: ${body.error ?? res.statusText}`);
  return body.result;
};

const METHODS = [
  'getConfiguration',
  'getConnectionStatus',
  'getShieldedAddresses',
  'getUnshieldedAddress',
  'getDustAddress',
  'getDustBalance',
  'getUnshieldedBalances',
  'balanceUnsealedTransaction',
  'submitTransaction',
  'hintUsage',
] as const;

const BRIDGE_ICON =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#3ecf8e"/><path d="M6 12h12M12 6v12" stroke="#06120c" stroke-width="2.4" stroke-linecap="round"/></svg>',
  );

export const installDevBridge = () => {
  const bridge: InitialAPI = {
    rdns: 'dev.carbonseal.bridge',
    name: 'Server wallet (dev bridge)',
    icon: BRIDGE_ICON,
    apiVersion: '4.0.0',
    connect: async () => {
      await call('getConnectionStatus');
      return Object.fromEntries(
        METHODS.map((m) => [m, (...params: unknown[]) => call(m, ...params)]),
      ) as unknown as ConnectedAPI;
    },
  };
  window.midnight = { ...(window.midnight ?? {}), carbonsealBridge: bridge };
};
