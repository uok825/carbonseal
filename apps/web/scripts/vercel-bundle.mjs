// SPDX-License-Identifier: Apache-2.0
//
// Builds the public demo for Vercel into apps/web/.vercel-site: the web app
// without the dev wallet bridge, polling the indexer through /indexer (Vercel
// cannot proxy WebSockets), plus the edge function that adds the token.
//
//   node scripts/vercel-bundle.mjs && cd .vercel-site && vercel deploy --prod

import { execSync } from 'node:child_process';
import { cpSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(web, '.vercel-site');

const env = { ...process.env, VITE_INDEXER_LIVE: '0' };
delete env.VITE_WALLET_BRIDGE;
execSync('npm run build', { cwd: web, stdio: 'inherit', env });

rmSync(path.join(out, 'assets'), { recursive: true, force: true });
cpSync(path.join(web, 'dist'), out, { recursive: true });
cpSync(path.join(web, 'deploy/vercel'), out, { recursive: true });
console.log(`Vercel site ready in ${path.relative(process.cwd(), out) || '.'}`);
