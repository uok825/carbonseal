// SPDX-License-Identifier: Apache-2.0

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { KeyValueStore } from '@carbonseal/api';

/**
 * A key-value store persisted as one JSON file, so participants keep their
 * secret keys and reports between CLI runs. Development use only: unencrypted.
 */
export const fileStore = (file: string): KeyValueStore => {
  const load = (): Record<string, string> =>
    existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>) : {};
  const save = (data: Record<string, string>) => {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 });
  };
  return {
    getItem: (key) => load()[key] ?? null,
    setItem: (key, value) => save({ ...load(), [key]: value }),
    removeItem: (key) => {
      const data = load();
      delete data[key];
      save(data);
    },
    keys: () => Object.keys(load()),
  };
};
