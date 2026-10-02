// SPDX-License-Identifier: Apache-2.0

export type NetworkConfig = {
  readonly id: string;
  readonly label: string;
  readonly indexer: string;
  readonly indexerWS: string;
};

const NETWORKS: Record<string, NetworkConfig> = {
  preprod: {
    id: 'preprod',
    label: 'Preprod',
    indexer: 'https://indexer.preprod.midnight.network/api/v4/graphql',
    indexerWS: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
  },
  preview: {
    id: 'preview',
    label: 'Preview',
    indexer: 'https://indexer.preview.midnight.network/api/v4/graphql',
    indexerWS: 'wss://indexer.preview.midnight.network/api/v4/graphql/ws',
  },
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
const network = NETWORKS[networkId];
if (!network) throw new Error(`Unsupported VITE_NETWORK_ID "${networkId}"`);

const contractAddress = import.meta.env.VITE_CONTRACT_ADDRESS || (networkId === 'preprod' ? PREPROD_REGISTRY : '');
if (!contractAddress) throw new Error(`Set VITE_CONTRACT_ADDRESS to a CarbonSeal registry on ${network.label}`);

export const config = { network, contractAddress } as const;
