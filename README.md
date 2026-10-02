# CarbonSeal

**Prove your steel is low-carbon. Reveal nothing else.**

CarbonSeal is a Midnight dApp for exporters affected by the EU Carbon Border Adjustment Mechanism (CBAM). A producer can show an EU buyer that a shipment's embedded emissions are below the buyer's threshold. An accredited verifier backs the claim. The producer never hands over production volumes, energy mix or installation data.

> **Status:** prototype built for the Midnight Buildathon (Wave 2).
> - **Live on preprod:** [`b95e3117…6d1ac4b7`](#on-chain-runs). Every circuit has run there and on a local network with real zero-knowledge proofs.
> - The web app's full flow (report → audit → attest → certify → buyer check) has run on preprod from a browser. That run used the [dev wallet bridge](#dev-wallet-bridge); Lace itself is still on its first sync.

## Why this needs privacy

Since 1 January 2026, EU importers of steel, aluminium, cement and other CBAM goods pay for the emissions embedded in what they buy. A supplier that cannot prove its real emissions is charged at default values, which include a mark-up of 10 % in 2026, rising to 30 % from 2028. Clean producers lose money unless they can prove what they emit.

That proof is commercially sensitive. Emission and production figures reveal a plant's efficiency, energy contracts, capacity and cost base. Producers do not want to give these to every buyer, and certainly not to competitors. Buyers, in turn, cannot rely on an unverified PDF.

CarbonSeal splits the problem along Midnight's dual-state model:

| Stays private (producer's device) | Public (Midnight ledger) |
|---|---|
| Direct and indirect emissions | Accredited verifier keys |
| Production volume | A commitment to each audited report |
| Installation identity, salt | Who attested it, for which product and period |
| Exact intensity | Shipment certificates: threshold, product, period, tonnes, buyer |
| Remaining verified capacity | Running total of tonnes certified per report |

The full analysis is in [`docs/PRIVACY-BOUNDARY.md`](docs/PRIVACY-BOUNDARY.md).

## How it works

```
 Producer                         Verifier                     Midnight ledger                 EU buyer
 ────────                         ────────                     ───────────────                 ────────
 report (private) ── audit pkg ─▶ recompute commitment
                                  attest(commitment) ────────▶ attestations[c]
 certify(shipment, c, threshold, tonnes)
   witness: report  ─ ZK proof ──────────────────────────────▶ certificates[id]   ◀──── verify(shipment id)
                                                               claimedTonnes[c] += t
```

1. **Accredit.** The registry authority adds a verifier's public key (`addVerifier`).
2. **Attest.** The producer sends its report to the verifier off-chain. The verifier recomputes the commitment from the audited data and calls `attest(commitment, operatorPk, product, period)`. Only the commitment is published.
3. **Certify.** For each shipment, the producer runs `certify`. The private report enters only as a witness. The circuit:
   - recomputes the commitment and checks it is attested, not revoked and owned by the caller;
   - checks `direct + indirect ≤ threshold × production`, i.e. intensity ≤ threshold, without division;
   - checks `claimed + tonnes ≤ production`, so the same low-carbon output cannot be sold twice;
   - records the certificate and the new running total.
4. **Verify.** The buyer looks up the shipment on the ledger. It checks the threshold, confirms the verifier is still accredited and confirms the attestation is still active.

A verifier can `revoke` an attestation; no further shipments can be certified against it, and buyers see the revocation.

## Midnight integration

- **Contract.** [`packages/contract/src/carbonseal.compact`](packages/contract/src/carbonseal.compact): Compact, language 0.23, compiler 0.31.1. It has 5 provable circuits (`addVerifier`, `removeVerifier`, `attest`, `revoke`, `certify`) and 2 pure helpers (`publicKey`, `reportCommitment`).
- **Private state.** [`packages/contract/src/witnesses.ts`](packages/contract/src/witnesses.ts) holds the participant's secret key and installation reports keyed by commitment. Every disclosure is explicit with `disclose()`; in `certify` the only values derived from the report that are disclosed are the two comparison results.
- **Identity.** A participant's ledger identity is `persistentHash("carbonseal:pk:", secretKey)`. The secret key never leaves the device.
- **Commitments.** `persistentHash("carbonseal:report:", persistentHash(report))`, where each report includes a 32-byte random salt.
- **SDK.** [`packages/api`](packages/api) uses `@midnight-ntwrk/midnight-js-*` 4.1.1 for deploy/join, `callTx` and indexer subscriptions.
- **Wallet.** [`apps/web/src/backend/network.ts`](apps/web/src/backend/network.ts) connects through the DApp Connector API v4 (Lace, 1AM) and proves through the wallet's configured proof server.

Versions follow the official [support matrix](https://docs.midnight.network/relnotes/support-matrix):

| Component | Version |
|---|---|
| Compact compiler | 0.31.1 |
| compact-runtime | 0.16.0 |
| Midnight.js | 4.1.1 |
| Proof server | 8.1.0 |

## Repository layout

```
packages/contract   Compact contract, witnesses, in-process simulator, contract tests
packages/api        CarbonSealClient interface; LocalRegistry (simulator) and
                    CarbonSealNetworkClient (midnight-js) implementations; CBAM helpers
apps/web            React app: producer, verifier, buyer and registry workspaces
apps/cli            Deploys a registry and drives every circuit on a real network
infra/devnet.yml    Local Midnight node, indexer and proof server (from midnight-local-dev)
docs/               Privacy boundary and design notes
```

## Running it

Requirements: Node 22+, npm 11 (`npx npm@11 install` if your npm is older, because npm 10 trips over vitest's optional peers), and the Compact toolchain:

```bash
curl --proto '=https' --tlsv1.2 -LsSf \
  https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
compact update 0.31.1
```

Then:

```bash
npm install
npm run ci        # compile contract → build → typecheck → test
npm run dev       # web app on http://localhost:5173, reading the preprod registry
```

### Web app

The app reads the registry's public state straight from the Midnight indexer. No wallet is needed for the following pages:
- **Overview:** live registry figures.
- **Buyer:** verify a shipment, e.g. `CLI-MURFA8GB` on preprod.
- **Registry:** the whole public ledger.

The **Producer** and **Verifier** workspaces act on chain, so they need a Midnight wallet.
- Use Lace or 1AM, on the same network, with a local proof server: `docker run -p 6300:6300 midnightntwrk/proof-server:8.1.0 midnight-proof-server -v`.
- The wallet balances, signs and submits each transaction.
- Your CarbonSeal key and private reports stay in the browser.

How a producer, verifier and authority work together:
1. **Verifier:** connect a wallet and copy the verifier key shown in the console.
2. **Authority:** accredit that key with `npm run admin:preprod -w @carbonseal/cli -- add-verifier <key>`.
3. **Producer:** connect, create a report, then *Send for audit*. This copies an audit package (it contains the private report) to send to the verifier off-chain.
4. **Verifier:** *Import package*. The console recomputes the commitment from the report before *Attest* is enabled.
5. **Producer:** *Certify shipment*. The buyer can now verify it on the Buyer page.

#### Dev wallet bridge

A first wallet sync on preprod can take hours: Lace's first preprod sync is known to stall ([lace#2257](https://github.com/input-output-hk/lace/issues/2257)). While a wallet is still syncing, the app can use the CLI's already-synced wallet instead:

```bash
npm run bridge:preprod -w @carbonseal/cli          # serves the wallet on 127.0.0.1:6301
VITE_WALLET_BRIDGE=1 npm run build -w @carbonseal/web && npx vite preview -c apps/web/vite.config.ts apps/web
```

How it works:
- **Connect wallet** then offers **Server wallet (dev bridge)**.
- Calls reach the bridge through the app's `/bridge` proxy.
- Proofs come from the proof server on port 6300.
- The bridge binds to localhost only; reach it through an SSH tunnel and never expose it.

This is how the browser flow was verified on preprod on 2 Oct 2026:
- attestation by a browser-held verifier key `537f7de4…`;
- certificate `TEST-SHIP-01`, 100 t at ≤ 1,900 kg/t.

Configuration lives in `apps/web/.env` (see `.env.example`):
- `VITE_NETWORK_ID`: `preprod` (default), `preview` or `undeployed`.
- `VITE_CONTRACT_ADDRESS`: defaults to the public preprod registry.

### Local Midnight network

Run the real contract against a local chain with real proofs:

```bash
npm run devnet:up        # node :9944, indexer :8088, proof server :6300 (Docker)
npm run scenario:local   # deploy + every circuit; writes apps/cli/deployments/local.json
npm run devnet:down
```

The scenario does the following:
- pays fees from the devnet's genesis wallet and registers its NIGHT for DUST;
- gives the authority, verifier and operator separate CarbonSeal identities, with private state in `apps/cli/.state/`;
- checks that two invalid certifications are rejected;
- reads the result back through the indexer.

To use the web app against this devnet, set `VITE_NETWORK_ID=undeployed` and `VITE_CONTRACT_ADDRESS` to the address in `apps/cli/deployments/local.json`.

## Tests

- **`packages/contract` (19 tests).** They run the real compiled circuits in the simulator. Covered:
  - accreditation rights;
  - double attestation;
  - threshold boundary (equal passes, one below fails);
  - cumulative over-certification;
  - duplicate shipments and zero tonnes;
  - revoked or unattested reports;
  - another party certifying;
  - a report altered after attestation;
  - a privacy test asserting that no private figure, installation id or salt appears in public state.
- **`packages/api` (10 tests).** They cover encoding, CBAM helpers, the full attest → certify flow through `LocalRegistry`, and private-state persistence, including the case where a dependency has installed `BigInt.prototype.toJSON`.

## On-chain runs

### Preprod

| | |
|---|---|
| Contract | `b95e3117ac4e482daa0c445a9c5a437b42b6d960bac67850695cc5ab6d1ac4b7` |
| Record | [`apps/cli/deployments/preprod.json`](apps/cli/deployments/preprod.json): every tx id and block |
| Run | 2 Oct 2026, blocks 2,809,240 – 2,809,265, proof server 8.1.0 |

The run went as follows:
- every circuit was included in about 21–33 s;
- the two invalid certifications were rejected before any proof was generated;
- the state read back from the indexer holds 1 verifier, 1 active and 1 revoked attestation, and 1 certificate.

Inspect it yourself with `npx tsx apps/cli/src/inspect.ts preprod <address>`.

To repeat the run, set up a fee wallet first:
1. Run `npm run wallet:preprod -w @carbonseal/cli` to get an address, and fund it from the faucet.
2. Run `npm run scenario:preprod`.

The first wallet sync replays preprod's DUST history, about 1.6M events. On a 2-vCPU machine that took about three hours. The synced state is then cached in `apps/cli/.state/`, and later runs start in minutes.

### Local devnet

This is the latest `npm run scenario:local` run, recorded in [`apps/cli/deployments/local.json`](apps/cli/deployments/local.json). It used the local devnet, proof server 8.1.0 and a 2-vCPU machine.

| Step | Result | Time |
|---|---|---|
| Deploy registry | contract `77132eff…922378` | 20.7 s |
| `addVerifier` ×2, `removeVerifier` | blocks 2227, 2231, 2235 | ~24 s each |
| `attest` | block 2239 | 24 s |
| `certify` (2,500 t at ≤ 1,900 kg/t) | block 2243 | 24 s |
| `certify` beyond verified production | rejected: *Shipment exceeds verified production* | before proving |
| `certify` below the real intensity | rejected: *Emission intensity exceeds threshold* | before proving |
| `attest` second report, then `revoke` | blocks 2247, 2251 | ~24 s each |

The indexed state afterwards held 1 verifier, 2 attestations (one revoked) and 1 certificate.

During the run, the machine never had less than 4.3 GB of free RAM, and the proof server peaked at about 310 MB.

### SDK issues found along the way

| Symptom | Cause | Fix in this repo |
|---|---|---|
| `expected instance of StateValue` on the first call | compact-runtime pulled in `onchain-runtime-v3` 3.1.1 next to midnight-js' 3.0.0; the two WASM copies reject each other's objects | root `overrides` pins 3.0.0 |
| `certify` witness type error | a dependency installs `BigInt.prototype.toJSON`, so bigints were stored as strings | private-state codec tags bigints itself |
| Node rejects a tx with `1010: Custom error 117` (NotNormalized) | when fee prices fall to zero, `wallet-sdk-dust-wallet` 4.2.0 still adds a fee intent, but with no DUST spends; a fee-less tx can also be dropped later | the CLI wallet adds a 0.01 DUST fee overhead (`apps/cli/src/wallet.ts`) |
| Preprod wallet sync times out | testkit `start()` waits 90 s; a cold DUST sync takes hours | own sync loop with checkpoints and an 8 h limit |

Set `CARBONSEAL_DEBUG_TX=1` to dump every balanced transaction to `apps/cli/.state/tx-dumps/`. This dump is how the error-117 cause was found.

## Roadmap

- **Wave 2 (now):**
  - contract and simulator tests;
  - runs with real proofs on a local devnet and on preprod;
  - a web app that reads the live registry without a wallet and acts on chain through Lace or 1AM;
  - the browser flow verified on preprod through the dev wallet bridge; still to do: repeat it with Lace once its first sync completes.
- **Wave 3:**
  - Playwright e2e against a local devnet (`midnight-local-dev`);
  - selective disclosure of the exact intensity to a named buyer;
  - proof of carbon price paid under the Turkish ETS (deductible from CBAM);
  - hash buyer EORIs instead of publishing them;
  - multi-product reports.

## Known limitations

- The emission model is simplified: one product per report, and direct plus indirect emissions only. It does not yet model precursors or the full CBAM methodology.
- The prototype stores private state unencrypted in `localStorage`.
- The web app's on-chain flow has been verified on preprod through the dev wallet bridge, but not yet with Lace or 1AM directly.
- Lace balances the web app's transactions itself. The CLI's fee-overhead fix for zero-fee transactions therefore does not apply there.
- The buyer reference (EORI) is currently published as a label.
- Each successful certification reveals a lower bound on production (the running total), by design.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE). Wallet connection code is adapted from [midnightntwrk/example-bboard](https://github.com/midnightntwrk/example-bboard) (Apache-2.0).
