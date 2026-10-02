// SPDX-License-Identifier: Apache-2.0

import './globals';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './styles/tokens.css';
import './styles/app.css';

import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { config } from './config';
import { AppProvider, ToastProvider } from './lib/app-state';

setNetworkId(config.network.id);

if (import.meta.env.VITE_WALLET_BRIDGE === '1') {
  void import('./backend/dev-bridge').then(({ installDevBridge }) => installDevBridge());
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <ToastProvider>
      <AppProvider>
        <App />
      </AppProvider>
    </ToastProvider>
  </StrictMode>,
);
