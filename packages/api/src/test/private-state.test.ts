// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';

import { keyValuePrivateStateProvider, memoryStore } from '../private-state.js';

type State = { secretKey: Uint8Array; reports: Record<string, { tonnes: bigint }> };

describe('keyValuePrivateStateProvider', () => {
  it('round-trips bigint and Uint8Array values, scoped per contract', async () => {
    const store = memoryStore();
    const provider = keyValuePrivateStateProvider<'ps', State>(store);
    const state: State = { secretKey: new Uint8Array([1, 2, 255]), reports: { ab: { tonnes: 120_000n } } };

    provider.setContractAddress('contract-a');
    await provider.set('ps', state);
    expect(await provider.get('ps')).toEqual(state);

    provider.setContractAddress('contract-b');
    expect(await provider.get('ps')).toBeNull();

    // A second provider over the same store sees the persisted value.
    const reopened = keyValuePrivateStateProvider<'ps', State>(store);
    reopened.setContractAddress('contract-a');
    expect(await reopened.get('ps')).toEqual(state);
  });

  it('keeps bigints intact when a library has installed BigInt.prototype.toJSON', async () => {
    const proto = BigInt.prototype as { toJSON?: () => string };
    proto.toJSON = function (this: bigint) {
      return this.toString();
    };
    try {
      const provider = keyValuePrivateStateProvider<'ps', State>(memoryStore());
      provider.setContractAddress('c');
      await provider.set('ps', { secretKey: new Uint8Array([7]), reports: { x: { tonnes: 5n } } });
      expect((await provider.get('ps'))?.reports.x?.tonnes).toBe(5n);
    } finally {
      delete proto.toJSON;
    }
  });

  it('refuses to read before a contract address is set', async () => {
    const provider = keyValuePrivateStateProvider<'ps', State>(memoryStore());
    await expect(async () => provider.get('ps')).rejects.toThrow('Contract address not set');
  });
});
