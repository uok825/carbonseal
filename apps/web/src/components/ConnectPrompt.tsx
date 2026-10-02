// SPDX-License-Identifier: Apache-2.0

import { Wallet } from 'lucide-react';

import { useApp } from '../lib/app-state';
import { Button } from './ui';

/** Shown in place of a workspace that needs a wallet to act. */
export const ConnectPrompt = ({ action }: { action: string }) => {
  const { connect, connecting, network } = useApp();
  return (
    <div className="empty" style={{ padding: '56px 24px', gap: 12 }}>
      <Wallet size={24} />
      <strong>Connect a Midnight wallet to {action}</strong>
      <div style={{ maxWidth: 460 }}>
        Use Lace or 1AM on {network.label}, with a local proof server on port 6300. Your CarbonSeal key and private
        reports stay in this browser.
      </div>
      <Button variant="primary" loading={connecting} onClick={() => void connect()} icon={<Wallet size={15} />}>
        Connect wallet
      </Button>
    </div>
  );
};
