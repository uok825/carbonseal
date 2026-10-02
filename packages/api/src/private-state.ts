// SPDX-License-Identifier: Apache-2.0
//
// A private state provider over any string key-value store: localStorage in
// the browser, a JSON file for the CLI. Adapted from the in-memory provider in
// midnightntwrk/example-bboard (Apache-2.0). Prototype only: values are stored
// unencrypted.

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

/** The subset of the Web Storage API the provider needs. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  keys(): string[];
}

type WebStorage = {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

/** Adapts a Web Storage object such as `localStorage`. */
export const webStorageStore = (storage: WebStorage): KeyValueStore => ({
  getItem: (key) => storage.getItem(key),
  setItem: (key, value) => storage.setItem(key, value),
  removeItem: (key) => storage.removeItem(key),
  keys: () =>
    Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((k): k is string => k !== null),
});

export const memoryStore = (): KeyValueStore => {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    keys: () => [...map.keys()],
  };
};

const PREFIX = 'carbonseal:private-state:';
const SIGNING_PREFIX = 'carbonseal:signing-key:';

// JSON cannot carry bigint or Uint8Array, both of which appear in Compact values.
// Tag them before stringifying: a replacer is not enough, because some
// dependencies install BigInt.prototype.toJSON, which runs before the replacer
// and turns every bigint into an untagged string.
const tag = (v: unknown): unknown => {
  if (typeof v === 'bigint') return { $bigint: v.toString() };
  if (v instanceof Uint8Array) return { $bytes: Array.from(v) };
  if (Array.isArray(v)) return v.map(tag);
  if (v !== null && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, tag(x)]));
  }
  return v;
};

const encode = (value: unknown): string => JSON.stringify(tag(value));

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
  store: KeyValueStore,
  entries: [string, string][],
  conflict: Conflict,
  keyFor: (id: string) => string,
): ImportPrivateStatesResult => {
  let imported = 0;
  let skipped = 0;
  let overwritten = 0;
  for (const [id, value] of entries) {
    const key = keyFor(id);
    if (store.getItem(key) !== null) {
      if (conflict === 'skip') {
        skipped++;
        continue;
      }
      if (conflict === 'error') throw new Error(`Conflict for '${id}'`);
      overwritten++;
    } else {
      imported++;
    }
    store.setItem(key, value);
  }
  return { imported, skipped, overwritten };
};

export const keyValuePrivateStateProvider = <PSI extends PrivateStateId, PS>(
  store: KeyValueStore,
): PrivateStateProvider<PSI, PS> => {
  let contractAddress: ContractAddress | null = null;

  const scope = (): string => {
    if (contractAddress === null) throw new Error('Contract address not set');
    return `${PREFIX}${contractAddress}:`;
  };
  const keysInScope = (): string[] => {
    const prefix = scope();
    return store.keys().filter((k) => k.startsWith(prefix));
  };

  return {
    setContractAddress(address: ContractAddress): void {
      contractAddress = address;
    },
    set(id: PSI, state: PS): Promise<void> {
      store.setItem(scope() + id, encode(state));
      return Promise.resolve();
    },
    get(id: PSI): Promise<PS | null> {
      const raw = store.getItem(scope() + id);
      return Promise.resolve(raw === null ? null : decode<PS>(raw));
    },
    remove(id: PSI): Promise<void> {
      store.removeItem(scope() + id);
      return Promise.resolve();
    },
    clear(): Promise<void> {
      keysInScope().forEach((k) => store.removeItem(k));
      return Promise.resolve();
    },
    setSigningKey(address: ContractAddress, signingKey: SigningKey): Promise<void> {
      store.setItem(SIGNING_PREFIX + address, encode(signingKey));
      return Promise.resolve();
    },
    getSigningKey(address: ContractAddress): Promise<SigningKey | null> {
      const raw = store.getItem(SIGNING_PREFIX + address);
      return Promise.resolve(raw === null ? null : decode<SigningKey>(raw));
    },
    removeSigningKey(address: ContractAddress): Promise<void> {
      store.removeItem(SIGNING_PREFIX + address);
      return Promise.resolve();
    },
    clearSigningKeys(): Promise<void> {
      store.keys()
        .filter((k) => k.startsWith(SIGNING_PREFIX))
        .forEach((k) => store.removeItem(k));
      return Promise.resolve();
    },
    exportPrivateStates(_options?: ExportPrivateStatesOptions): Promise<PrivateStateExport> {
      const prefix = scope();
      const states = Object.fromEntries(keysInScope().map((k) => [k.slice(prefix.length), store.getItem(k)]));
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
        return Promise.resolve(importEntries(store, entries, options?.conflictStrategy ?? 'error', (id) => prefix + id));
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
      }
    },
    exportSigningKeys(_options?: ExportSigningKeysOptions): Promise<SigningKeyExport> {
      const keys = Object.fromEntries(
        store.keys()
          .filter((k) => k.startsWith(SIGNING_PREFIX))
          .map((k) => [k.slice(SIGNING_PREFIX.length), store.getItem(k)]),
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
          importEntries(store, entries, options?.conflictStrategy ?? 'error', (address) => SIGNING_PREFIX + address),
        );
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
      }
    },
  };
};
