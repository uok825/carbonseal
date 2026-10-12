// SPDX-License-Identifier: Apache-2.0

export type NetworkConfig = {
  readonly id: string;
  readonly label: string;
  readonly indexer: string;
  readonly indexerWS: string;
};

/**
 * The hosted Midnight indexers (Blockfrost) need a project token. The app
 * never ships it: it calls /indexer on its own origin, and the server that
 * hosts it (vite.config.ts in development) adds the token upstream.
 */
const sameOriginIndexer = () => ({
  indexer: `${window.location.origin}/indexer`,
  indexerWS: `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/indexer/ws`,
});

const NETWORKS: Record<string, NetworkConfig> = {
  preprod: { id: 'preprod', label: 'Preprod', ...sameOriginIndexer() },
  preview: { id: 'preview', label: 'Preview', ...sameOriginIndexer() },
  // A local devnet from infra/devnet.yml.
  undeployed: {
    id: 'undeployed',
    label: 'Local devnet',
    indexer: 'http://127.0.0.1:8088/api/v4/graphql',
    indexerWS: 'ws://127.0.0.1:8088/api/v4/graphql/ws',
  },
};

/** The public CarbonSeal registry on preprod (apps/cli/deployments/preprod.json). */
const PREPROD_REGISTRY = 'b95e3117ac4e482daa0c445a9c5a437b42b6d960bac67850695cc5ab6d1ac4b7';

const networkId = import.meta.env.VITE_NETWORK_ID || 'preprod';
const known = NETWORKS[networkId];
if (!known) throw new Error(`Unsupported VITE_NETWORK_ID "${networkId}"`);
const network: NetworkConfig = {
  ...known,
  indexer: import.meta.env.VITE_INDEXER_URL || known.indexer,
  indexerWS: import.meta.env.VITE_INDEXER_WS_URL || known.indexerWS,
};

const contractAddress = import.meta.env.VITE_CONTRACT_ADDRESS || (networkId === 'preprod' ? PREPROD_REGISTRY : '');
if (!contractAddress) throw new Error(`Set VITE_CONTRACT_ADDRESS to a CarbonSeal registry on ${network.label}`);

export const config = { network, contractAddress } as const;
