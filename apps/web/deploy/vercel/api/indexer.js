// SPDX-License-Identifier: Apache-2.0
//
// Indexer proxy for the hosted demo: forwards GraphQL queries to Blockfrost
// and adds the project token, which lives only in the Vercel environment
// (BLOCKFROST_PROJECT_ID) and never reaches the browser.

export const config = { runtime: 'edge' };

const UPSTREAM = {
  preprod: 'https://midnight-preprod.blockfrost.io/api/v0',
  preview: 'https://midnight-preview.blockfrost.io/api/v0',
};
const MAX_BODY = 64 * 1024;

export default async function handler(request) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const upstream = UPSTREAM[process.env.MIDNIGHT_NETWORK ?? 'preprod'];
  const token = process.env.BLOCKFROST_PROJECT_ID;
  if (!upstream || !token) return new Response('Indexer proxy is not configured', { status: 503 });

  const body = await request.text();
  if (body.length > MAX_BODY) return new Response('Query too large', { status: 413 });
  // Read-only: the app only queries the indexer.
  if (/\bmutation\b/i.test(body)) return new Response('Only queries are allowed', { status: 400 });

  const response = await fetch(upstream, {
    method: 'POST',
    headers: { 'content-type': 'application/json', project_id: token },
    body,
  });
  return new Response(response.body, {
    status: response.status,
    headers: { 'content-type': response.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' },
  });
}
