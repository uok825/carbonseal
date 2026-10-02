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

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <ToastProvider>
      <AppProvider>
        <App />
      </AppProvider>
    </ToastProvider>
  </StrictMode>,
);
