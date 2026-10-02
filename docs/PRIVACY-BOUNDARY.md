# Privacy boundary

This document lists, circuit by circuit, what CarbonSeal publishes and what it proves without publishing.

## Parties and what each one knows

| Party | Knows |
|---|---|
| Producer (operator) | Everything about its own reports, plus its secret key |
| Verifier | The reports it audits. These are shared off-chain on purpose, as in any CBAM verification |
| Registry authority | Only public state, plus its own secret key |
| Buyer, and everyone else | Only public state |

## Public ledger state

| Field | Contents |
|---|---|
| `authority` | Authority public key |
| `verifiers` | Accredited verifier public keys |
| `attestations[commitment]` | Verifier key, operator key, CN product code, period, revoked flag |
| `claimedTonnes[commitment]` | Running total of tonnes certified against the report |
| `certificates[shipmentId]` | Report commitment, product, period, threshold (kg CO₂e/t), tonnes, buyer reference |
| `certificateCount` | Number of certificates issued |

## Per circuit

| Circuit | Private inputs (witnesses) | Disclosed |
|---|---|---|
| `addVerifier` / `removeVerifier` | caller secret key | the verifier key. The check that the caller is the authority is proven, and the caller's key is never published |
| `attest` | caller secret key | the verifier's public key, the commitment, operator key, product, period |
| `revoke` | caller secret key | the commitment, and the fact that it was revoked |
| `certify` | caller secret key, full installation report | shipment id, commitment, threshold, tonnes, buyer. Also two booleans: *intensity ≤ threshold* and *claimed + tonnes ≤ production* |

## What an observer can infer

- **Lower bound on production.** `claimedTonnes[c]` shows how many tonnes have been certified against a report. Production must be at least that number. This is inherent to preventing double-selling. A later version can blind it, for example by committing to remaining capacity instead.
- **Upper bound on intensity.** Each certificate shows intensity ≤ its threshold. A producer who certifies at progressively tighter thresholds narrows the bound. Producers should use the buyer's required threshold, not their exact value.
- **Linkability.** All shipments certified against one report share its commitment, so they are linkable to the same installation and period. They are not linked to the installation's real identity.

## What cannot be learned

- Emissions, production volume and exact intensity.
- Installation reference and salt. The commitment is a hash over a 32-byte random salt, so it cannot be brute-forced from guessed figures.
- Any participant's secret key.

These properties are checked by the `privacy boundary` tests in `packages/contract/src/test/carbonseal.test.ts`.
