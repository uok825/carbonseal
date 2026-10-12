// SPDX-License-Identifier: Apache-2.0

import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import type { PublicDataProvider } from '@midnight-ntwrk/midnight-js-types';
import { NEVER } from 'rxjs';

import { config } from '../config';

/**
 * The app's indexer. Without live updates (a host that cannot proxy
 * WebSockets) contract state is never subscribed to; watchRegistry's HTTP
 * polling keeps it current, and transactions are already watched over HTTP.
 */
export const appPublicDataProvider = (): PublicDataProvider => {
  const provider = indexerPublicDataProvider(config.network.indexer, config.network.indexerWS);
  return config.network.live ? provider : { ...provider, contractStateObservable: () => NEVER };
};
