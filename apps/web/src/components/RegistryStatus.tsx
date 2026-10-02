// SPDX-License-Identifier: Apache-2.0

import { AlertTriangle, Loader2 } from 'lucide-react';

import { errorMessage, useApp, useRegistry } from '../lib/app-state';

/** Explains a missing snapshot: still loading from the indexer, or unreachable. */
export const RegistryStatus = () => {
  const { network } = useApp();
  const { value, error } = useRegistry();
  if (error !== undefined) {
    return (
      <div className="banner danger">
        <AlertTriangle size={15} /> Could not read the registry from the {network.label} indexer: {errorMessage(error)}
      </div>
    );
  }
  if (value === undefined) {
    return (
      <div className="check-row muted">
        <Loader2 size={15} className="spin" /> Reading the registry from {network.label}…
      </div>
    );
  }
  return null;
};
