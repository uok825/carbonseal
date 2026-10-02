// SPDX-License-Identifier: Apache-2.0
//
// Private state provider for the browser, persisted in localStorage so an
// operator's secret key and installation reports survive a page reload.
// Adapted from the in-memory provider in midnightntwrk/example-bboard
// (Apache-2.0). Prototype only: values are stored unencrypted.

import type { ContractAddress, SigningKey } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import type {
  ExportPrivateStatesOptions,
  ExportSigningKeysOptions,
  ImportPrivateStatesOptions,
  ImportPrivateStatesResult,
  ImportSigningKeysOptions,
  ImportSigningKeysResult,
  PrivateStateExport,
  PrivateStateId,
  PrivateStateProvider,
  SigningKeyExport,
} from '@midnight-ntwrk/midnight-js-types';

const PREFIX = 'carbonseal:private-state:';
const SIGNING_PREFIX = 'carbonseal:signing-key:';

// JSON cannot carry bigint or Uint8Array, both of which appear in Compact values.
const encode = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) => {
    if (typeof v === 'bigint') return { $bigint: v.toString() };
    if (v instanceof Uint8Array) return { $bytes: Array.from(v) };
    return v;
  });

const decode = <T>(text: string): T =>
  JSON.parse(text, (_key, v: unknown) => {
    if (v !== null && typeof v === 'object') {
      if ('$bigint' in v) return BigInt((v as { $bigint: string }).$bigint);
      if ('$bytes' in v) return Uint8Array.from((v as { $bytes: number[] }).$bytes);
    }
    return v;
  }) as T;

type Conflict = 'skip' | 'overwrite' | 'error';

const importEntries = (
  entries: [string, string][],
  conflict: Conflict,
  keyFor: (id: string) => string,
): ImportPrivateStatesResult => {
  let imported = 0;
  let skipped = 0;
  let overwritten = 0;
  for (const [id, value] of entries) {
    const key = keyFor(id);
    if (localStorage.getItem(key) !== null) {
      if (conflict === 'skip') {
        skipped++;
        continue;
      }
      if (conflict === 'error') throw new Error(`Conflict for '${id}'`);
      overwritten++;
    } else {
      imported++;
    }
    localStorage.setItem(key, value);
  }
  return { imported, skipped, overwritten };
};

export const browserPrivateStateProvider = <PSI extends PrivateStateId, PS>(): PrivateStateProvider<PSI, PS> => {
  let contractAddress: ContractAddress | null = null;

  const scope = (): string => {
    if (contractAddress === null) throw new Error('Contract address not set');
    return `${PREFIX}${contractAddress}:`;
  };
  const keysInScope = (): string[] => {
    const prefix = scope();
    return Object.keys(localStorage).filter((k) => k.startsWith(prefix));
  };

  return {
    setContractAddress(address: ContractAddress): void {
      contractAddress = address;
    },
    set(id: PSI, state: PS): Promise<void> {
      localStorage.setItem(scope() + id, encode(state));
      return Promise.resolve();
    },
    get(id: PSI): Promise<PS | null> {
      const raw = localStorage.getItem(scope() + id);
      return Promise.resolve(raw === null ? null : decode<PS>(raw));
    },
    remove(id: PSI): Promise<void> {
      localStorage.removeItem(scope() + id);
      return Promise.resolve();
    },
    clear(): Promise<void> {
      keysInScope().forEach((k) => localStorage.removeItem(k));
      return Promise.resolve();
    },
    setSigningKey(address: ContractAddress, signingKey: SigningKey): Promise<void> {
      localStorage.setItem(SIGNING_PREFIX + address, encode(signingKey));
      return Promise.resolve();
    },
    getSigningKey(address: ContractAddress): Promise<SigningKey | null> {
      const raw = localStorage.getItem(SIGNING_PREFIX + address);
      return Promise.resolve(raw === null ? null : decode<SigningKey>(raw));
    },
    removeSigningKey(address: ContractAddress): Promise<void> {
      localStorage.removeItem(SIGNING_PREFIX + address);
      return Promise.resolve();
    },
    clearSigningKeys(): Promise<void> {
      Object.keys(localStorage)
        .filter((k) => k.startsWith(SIGNING_PREFIX))
        .forEach((k) => localStorage.removeItem(k));
      return Promise.resolve();
    },
    exportPrivateStates(_options?: ExportPrivateStatesOptions): Promise<PrivateStateExport> {
      const prefix = scope();
      const states = Object.fromEntries(keysInScope().map((k) => [k.slice(prefix.length), localStorage.getItem(k)]));
      return Promise.resolve({
        format: 'midnight-private-state-export',
        encryptedPayload: JSON.stringify(states),
        salt: 'carbonseal-unencrypted',
      });
    },
    importPrivateStates(
      exportData: PrivateStateExport,
      options?: ImportPrivateStatesOptions,
    ): Promise<ImportPrivateStatesResult> {
      const prefix = scope();
      const entries = Object.entries(JSON.parse(exportData.encryptedPayload) as Record<string, string>);
      try {
        return Promise.resolve(importEntries(entries, options?.conflictStrategy ?? 'error', (id) => prefix + id));
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
      }
    },
    exportSigningKeys(_options?: ExportSigningKeysOptions): Promise<SigningKeyExport> {
      const keys = Object.fromEntries(
        Object.keys(localStorage)
          .filter((k) => k.startsWith(SIGNING_PREFIX))
          .map((k) => [k.slice(SIGNING_PREFIX.length), localStorage.getItem(k)]),
      );
      return Promise.resolve({
        format: 'midnight-signing-key-export',
        encryptedPayload: JSON.stringify(keys),
        salt: 'carbonseal-unencrypted',
      });
    },
    importSigningKeys(exportData: SigningKeyExport, options?: ImportSigningKeysOptions): Promise<ImportSigningKeysResult> {
      const entries = Object.entries(JSON.parse(exportData.encryptedPayload) as Record<string, string>);
      try {
        return Promise.resolve(
          importEntries(entries, options?.conflictStrategy ?? 'error', (address) => SIGNING_PREFIX + address),
        );
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
      }
    },
  };
};
