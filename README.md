# Regulatory Activity Graph Gate

Regulatory Activity Graph Gate is a release check for changes that alter approved financial activity. It reads source code, builds a financial activity graph, and compares that graph with an approved baseline before release.

## What it checks

Source changes can affect fund routing, lending relationships, and settlement paths even when the code diff looks small. Git shows the source change; this project checks whether the resulting financial activity topology has changed.

## How it works

The project extracts evidence from TypeScript source, builds a graph of the observed activity, calculates the graph delta against the baseline, and evaluates the configured policies. The CLI returns `PASS`, `REVIEW`, or `BLOCK` and writes audit artifacts for the evaluation.

## Quickstart

```bash
npm install
npm test
```

Run a source evaluation:

```bash
npm run cli -- evaluate --baseline .regulatory/approved-baseline.json --source fixtures/source/block-flow.ts --json
```

The test suite does not need an API key, OPA binary, network access, or database. All tests run offline.

The live semantic fallback uses Gemini with `GEMINI_API_KEY` instead of the originally specified OpenAI provider. This was a buildathon cost decision. It uses `gemini-3.6-flash`, chosen because it was available on the current account and less contended than Gemini 3.7 Flash for this single-call extraction step. A live check confirmed that unresolved routing reaches `UNCERTAIN-EVIDENCE` and returns `REVIEW`, while the locally defined decoy client returns `PASS`. Offline tests do not call either provider; evidence validation, graph construction, and policy evaluation do not depend on the provider.

## Demo cases

| Case | Scenario | Decision |
|------|----------|----------|
| 1 | Logging rename, no topology change | `PASS` |
| 2 | Partner X NBFC, 90-day installment plan, approved partner | `REVIEW` |
| 3 | Pool/treasury account replaces escrow | `BLOCK` |
| 4 | `routePayment(paymentConfig.destination, payload)` — uncertain AI | `REVIEW` |

## Policies

| ID | Rule | Severity | Source |
|----|------|----------|--------|
| DL-01 | Pool/pass-through account detected (`POOL_PASS_THROUGH` mechanism) | **BLOCK** | RBI (Digital Lending) Directions, 2025, Para 9 *(moderate confidence — see `policy-sources/dl-01.json`)* |
| PA-01 | PA funds reach merchant without ESCROW_BANK intermediary | **REVIEW** | RBI PA Master Direction 2025, RBI/DPSS/2025-26/141 |
| DL-02 | `FINANCING_PROVIDER` actor not in approved-partners registry | **BLOCK** | Para 17–derived internal governance control *(not a direct CIMS-compliance test; see `policy-sources/dl-02.json`)* |
| DL-03 | New `Obligation` appears in delta (new lending relationship) | **REVIEW** | Project-defined safety-net rule, not a specific RBI clause — see `policy-sources/dl-03.json` |

Each policy has source metadata in `policy-sources/`.

## Project structure

- `src/graph/` contains the financial topology model, canonical hashes, and deltas.
- `src/policy/` contains deterministic policy evaluation.
- `src/evidence/` contains AST extraction and the semantic fallback.
- `src/cli/` contains the release command and audit artifact output.
- `fixtures/` and `policy-sources/` contain demo inputs and policy rationale.

## Regulatory-source note

DL-01 and DL-02 were originally cited against the September 2022 Guidelines on Digital Lending. That document was consolidated and replaced by the RBI (Digital Lending) Directions, 2025, effective May 8, 2025. Para 9 addresses direct loan disbursal and repayment. Para 17 requires reporting deployed DLAs to RBI's CIMS portal.

DL-02 is an internal pre-release control derived from the record-keeping and certification obligation in Para 17. It does not claim to prove CIMS compliance. RBI's primary page blocks automated retrieval, so the primary notice should be checked before quoting a paragraph in external submission material.

For implementation details, policy rationale, canonicalization rules, baseline governance, and known limitations, see [ARCHITECTURE.md](ARCHITECTURE.md).
