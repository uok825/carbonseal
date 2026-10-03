# CarbonSeal

![CarbonSeal: prove your steel is low-carbon, reveal nothing else](docs/brand/cover.jpg)

**Prove your steel is low-carbon. Reveal nothing else.**

CarbonSeal is a Midnight dApp for exporters affected by the EU Carbon Border Adjustment Mechanism (CBAM). A producer can show an EU buyer that a shipment's embedded emissions are below the buyer's threshold. An accredited verifier backs the claim. The producer never hands over production volumes, energy mix or installation data.

> **Status:** prototype built for the Midnight Buildathon (Wave 2).
> - **Live on preprod:** [`b95e3117…1ac4b7`](https://preprod.midnightexplorer.com/contracts/0xb95e3117ac4e482daa0c445a9c5a437b42b6d960bac67850695cc5ab6d1ac4b7), with [every transaction linked](#every-preprod-transaction). Every circuit has run there and on a local network with real zero-knowledge proofs.
> - The web app's full flow (report → audit → attest → certify → buyer check) has run on preprod from a browser with **Lace**, and also through the [dev wallet bridge](#dev-wallet-bridge).

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

Browser runs on preprod:
- **2 Oct 2026, dev wallet bridge:** an attestation by the browser-held verifier key `537f7de4…`, then certificate `TEST-SHIP-01` (100 t at ≤ 1,900 kg/t).
- **3 Oct 2026, Lace:** after Lace's first sync and DUST registration, Lace signed and paid for the attestation of report `a6f664…`, then certificate `TEST-SHIP-02` (50 t of rebar at ≤ 1,000 kg/t). Proofs came from a proof server reached through an SSH tunnel.

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
| Contract | [`b95e3117ac4e482daa0c445a9c5a437b42b6d960bac67850695cc5ab6d1ac4b7`](https://preprod.midnightexplorer.com/contracts/0xb95e3117ac4e482daa0c445a9c5a437b42b6d960bac67850695cc5ab6d1ac4b7) |
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

### Every preprod transaction

All transactions of the registry [`b95e3117ac4e482daa0c445a9c5a437b42b6d960bac67850695cc5ab6d1ac4b7`](https://preprod.midnightexplorer.com/contracts/0xb95e3117ac4e482daa0c445a9c5a437b42b6d960bac67850695cc5ab6d1ac4b7), oldest first. They were read back from the indexer.

| Time (UTC) | Block | Circuit | What | Sent by | Transaction |
|---|---|---|---|---|---|
| 2026-10-02 20:33 | [2,809,236](https://preprod.midnightexplorer.com/blocks/2809236) | `deploy` | Deploy registry | CLI scenario | [`0x0d4cc68084…`](https://preprod.midnightexplorer.com/transactions/0x0d4cc68084b635efd440d984b318b3877e609bb3ce8bd5378234302d4bf96f11) |
| 2026-10-02 20:34 | [2,809,240](https://preprod.midnightexplorer.com/blocks/2809240) | `addVerifier` | Accredit verifier | CLI scenario | [`0x9601ff6aa4…`](https://preprod.midnightexplorer.com/transactions/0x9601ff6aa413449f218f5826d1d1e1d233cf36b09a81574ce93d4b29b9486b1b) |
| 2026-10-02 20:34 | [2,809,244](https://preprod.midnightexplorer.com/blocks/2809244) | `addVerifier` | Accredit second verifier | CLI scenario | [`0x3d2a3ff402…`](https://preprod.midnightexplorer.com/transactions/0x3d2a3ff40223ef9f13a03a8add1452045232f676027af05ed58d9ab503496524) |
| 2026-10-02 20:35 | [2,809,249](https://preprod.midnightexplorer.com/blocks/2809249) | `removeVerifier` | Remove verifier | CLI scenario | [`0x5c84db5b36…`](https://preprod.midnightexplorer.com/transactions/0x5c84db5b36a9ca176de9a642fee0b0924d5be12f4b5a2321cf9e073810bcffe3) |
| 2026-10-02 20:35 | [2,809,253](https://preprod.midnightexplorer.com/blocks/2809253) | `attest` | Attest report | CLI scenario | [`0xdea6c87133…`](https://preprod.midnightexplorer.com/transactions/0xdea6c87133d003631c84e94381a5acff0ed705521b079c1126dd42480c21fa9d) |
| 2026-10-02 20:35 | [2,809,257](https://preprod.midnightexplorer.com/blocks/2809257) | `certify` | Certify CLI-MURFA8GB, 2,500 t ≤ 1,900 kg/t | CLI scenario | [`0xed32e7d1d7…`](https://preprod.midnightexplorer.com/transactions/0xed32e7d1d70e20747554da5b596c97df3166fd379dab6eefefb2f608cc084867) |
| 2026-10-02 20:36 | [2,809,261](https://preprod.midnightexplorer.com/blocks/2809261) | `attest` | Attest second report | CLI scenario | [`0x8d0ed5b4aa…`](https://preprod.midnightexplorer.com/transactions/0x8d0ed5b4aa7d1a4ce0aa4a4def75019e90763f2116a60bda379c1e4719aa9815) |
| 2026-10-02 20:36 | [2,809,265](https://preprod.midnightexplorer.com/blocks/2809265) | `revoke` | Revoke attestation | CLI scenario | [`0x46ad8ab63f…`](https://preprod.midnightexplorer.com/transactions/0x46ad8ab63f0c7e0c883f1518ce66c05ac8fbc99dfa6bfb89bbb342c166965949) |
| 2026-10-02 21:30 | [2,809,805](https://preprod.midnightexplorer.com/blocks/2809805) | `addVerifier` | Accredit browser verifier key 537f7de4… | CLI admin | [`0x9b6fcdecf1…`](https://preprod.midnightexplorer.com/transactions/0x9b6fcdecf10db061d408137bafa07a4626a485d2c1766e653ac0b7503b25bba3) |
| 2026-10-02 22:10 | [2,810,201](https://preprod.midnightexplorer.com/blocks/2810201) | `attest` | Attest report 7473c443… | Browser · dev wallet bridge | [`0x24d0ab41a6…`](https://preprod.midnightexplorer.com/transactions/0x24d0ab41a6070a37fdb7670957f2f90ba6f051cbda972f9b4b8c7e8d5f3f01e1) |
| 2026-10-02 22:12 | [2,810,219](https://preprod.midnightexplorer.com/blocks/2810219) | `certify` | Certify TEST-SHIP-01, 100 t ≤ 1,900 kg/t | Browser · dev wallet bridge | [`0xde2ab00ffd…`](https://preprod.midnightexplorer.com/transactions/0xde2ab00ffdc568eca5e1db7dc3efe7a3f6f2cdfdee0b3dbd1cc96e4be8c3c9e4) |
| 2026-10-03 12:09 | [2,818,589](https://preprod.midnightexplorer.com/blocks/2818589) | `attest` | Attest report a6f664e5… | Browser · Lace | [`0xadf2c45d37…`](https://preprod.midnightexplorer.com/transactions/0xadf2c45d37a085c8399057e1194094fa3863c82fe6bf0bc556292cca57624e48) |
| 2026-10-03 12:14 | [2,818,645](https://preprod.midnightexplorer.com/blocks/2818645) | `certify` | Certify TEST-SHIP-02, 50 t ≤ 1,000 kg/t | Browser · Lace | [`0x29ad92986b…`](https://preprod.midnightexplorer.com/transactions/0x29ad92986b9dbdf3f3d23f08ebd9e8b6c46048095c2da843dee6447aeadae179) |

Fee wallet funding: the faucet sent 5,000 tNIGHT to the CLI wallet in [`0xc1811c68ee…`](https://preprod.midnightexplorer.com/transactions/0xc1811c68ee62c79f1683a90f2de8aa6404d62e888108194eaaf514748b1f8a85).

Earlier preprod deployments made while diagnosing [error 117](#sdk-issues-found-along-the-way). None of them is used by the app.

| Contract | Run | Transactions |
|---|---|---|
| [`59ea59d5…201672`](https://preprod.midnightexplorer.com/contracts/0x59ea59d59da39131954ad792aba95466b14de7a168548457bce89d6a05201672) | first preprod run; stopped by error 117 at removeVerifier | `deploy` [`0x85b3ff4706…`](https://preprod.midnightexplorer.com/transactions/0x85b3ff47062c156dbae427436dc8f2ac4f67035d8c19784bbd77b670336c3c8f), `addVerifier` [`0x6b29523b2d…`](https://preprod.midnightexplorer.com/transactions/0x6b29523b2d15fe7640fb4c37d87c7b51185e4f2e828258065558c7f51cc5a261), `addVerifier` [`0x630f9a6e10…`](https://preprod.midnightexplorer.com/transactions/0x630f9a6e102dbe40c2da177b51a1e64f53fc1d712ccbbfa5d8186c5064f9f5c3) |
| [`a3a51b96…beba6f`](https://preprod.midnightexplorer.com/contracts/0xa3a51b96c0a090682ca4cd81116863403b3a607ab4665d0527d7435072beba6f) | diagnostic run with transaction dumps; error 117 again | `deploy` [`0xad7856cf85…`](https://preprod.midnightexplorer.com/transactions/0xad7856cf853f2d21008a22c1482dd5f02f4dee31036e754c10387801fc6d4e3c), `addVerifier` [`0x07a5c5a08b…`](https://preprod.midnightexplorer.com/transactions/0x07a5c5a08baedb879dbf6b7c652f3fefea25001db25262080120e9091e1318d8), `addVerifier` [`0x0c4be6f4ba…`](https://preprod.midnightexplorer.com/transactions/0x0c4be6f4badfab5baf13a884913c2b47790a94d61dc7d161e67f4301c3d2cdb8) |
| [`a123b4ec…390d6b`](https://preprod.midnightexplorer.com/contracts/0xa123b4ec049d265edf4792f8e6f1cffca3babcc62df21fc36046e2db40390d6b) | zero-fee workaround: removeVerifier passed, the fee-less revoke was dropped | `deploy` [`0x0719906bd3…`](https://preprod.midnightexplorer.com/transactions/0x0719906bd3ec36e97526f1803da5988e0af73427c81b048848e1624df7d18a2d), `addVerifier` [`0x65a6188205…`](https://preprod.midnightexplorer.com/transactions/0x65a6188205380390ee9254740af67271920d0bf98851b644cca4bc83a30b39d7), `addVerifier` [`0x02308a8ff4…`](https://preprod.midnightexplorer.com/transactions/0x02308a8ff4541b4ff6ba5e28090eb3efbe7feb941a29785a47e168f1580dcde8), `removeVerifier` [`0x0a059045d8…`](https://preprod.midnightexplorer.com/transactions/0x0a059045d8d510f3556d97abf7a91231055ffa717b0cf5806066bbaba24f192e), `attest` [`0x24ccd3d771…`](https://preprod.midnightexplorer.com/transactions/0x24ccd3d771546ff048e0b83575408a3b188b2d15add0db7803a5a9688e658e80), `certify` [`0x52bf0f94f4…`](https://preprod.midnightexplorer.com/transactions/0x52bf0f94f4d11bc883c87c2901e14d003e0f3c2624e28130c0b91aba916b9c27), `attest` [`0x8844019c20…`](https://preprod.midnightexplorer.com/transactions/0x8844019c20e46d43d87b9a319e0b2b196e4ccc4a4c774e487dd814c9b9fcf488) |

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
  - the browser flow verified on preprod with Lace and through the dev wallet bridge.
- **Wave 3:**
  - Playwright e2e against a local devnet (`midnight-local-dev`);
  - selective disclosure of the exact intensity to a named buyer;
  - proof of carbon price paid under the Turkish ETS (deductible from CBAM);
  - hash buyer EORIs instead of publishing them;
  - multi-product reports.

## Known limitations

- The emission model is simplified: one product per report, and direct plus indirect emissions only. It does not yet model precursors or the full CBAM methodology.
- The prototype stores private state unencrypted in `localStorage`.
- The web app's on-chain flow has been verified on preprod with Lace; 1AM is untested.
- Lace balances the web app's transactions itself. The CLI's fee-overhead fix for zero-fee transactions therefore does not apply there. A zero-fee call, such as `removeVerifier` on a quiet network, may still hit error 117 in Lace.
- A first Lace sync on preprod takes long, and DUST must be generated before the first transaction. Lace shows this as the "tDUST tank".
- The buyer reference (EORI) is currently published as a label.
- Each successful certification reveals a lower bound on production (the running total), by design.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE). Wallet connection code is adapted from [midnightntwrk/example-bboard](https://github.com/midnightntwrk/example-bboard) (Apache-2.0).
