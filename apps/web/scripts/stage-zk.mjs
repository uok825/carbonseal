// Copies the contract's proving keys and ZKIR into public/ so the browser can
// fetch them (FetchZkConfigProvider reads <origin>/keys and <origin>/zkir).
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const managed = resolve(here, '../../../packages/contract/src/managed/carbonseal');
const pub = resolve(here, '../public');

if (!existsSync(managed)) {
  console.error('Contract is not compiled. Run `npm run compact` from the repository root first.');
  process.exit(1);
}
for (const dir of ['keys', 'zkir']) {
  rmSync(resolve(pub, dir), { recursive: true, force: true });
  cpSync(resolve(managed, dir), resolve(pub, dir), { recursive: true });
}
console.log('Staged ZK assets into apps/web/public');
