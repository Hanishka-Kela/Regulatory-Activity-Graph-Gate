# Regulatory Activity Graph Gate

Regulatory Activity Graph Gate checks whether a TypeScript change changes approved financial activity before it is released. It extracts evidence from source code, models the related money movement and lending activity as a graph, then compares it with an approved baseline.

The CLI returns `PASS`, `REVIEW`, or `BLOCK` and writes the evaluation artifacts needed to inspect the result.

## Problem

A small code or configuration change can change where funds move, add a financing partner, create a lending relationship, or bypass an expected settlement path. A normal source diff does not show those effects directly. This project evaluates the financial activity represented by the code change instead.

## How it works

1. The extractor reads TypeScript source and identifies supported financial SDK calls.
2. Gemini classifies financially relevant calls that cannot be resolved by the deterministic extractor.
3. The extracted evidence is converted into a financial activity graph.
4. The proposed graph is compared with the approved baseline.
5. Policy rules evaluate the graph delta and proposed graph.
6. The CLI returns `PASS`, `REVIEW`, or `BLOCK` and produces audit artifacts.

## Quickstart

```bash
npm install
npm test
```

Run a source evaluation:

```bash
npm run cli -- evaluate --baseline .regulatory/approved-baseline.json --source fixtures/source/block-flow.ts --json
```

Tests run offline and do not require an API key, OPA binary, network access, or a database. Gemini is only used by the live semantic fallback through `GEMINI_API_KEY`.

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

Policy metadata is stored in `policy-sources/`. Paragraph references should be verified against the primary RBI publication before being quoted externally.

## Project structure

- `src/graph/` — financial activity types, canonical hashes, graph construction, and deltas.
- `src/policy/` — policy evaluation and approved-partner checks.
- `src/evidence/` — TypeScript AST extraction and the Gemini semantic fallback.
- `src/cli/` — CLI evaluation command and audit artifact output.
- `fixtures/` — source files and graph fixtures used by the demo cases and tests.
- `policy-sources/` — policy rationale and regulatory-source metadata.

## Limitations

- The deterministic extractor supports a limited set of SDK call patterns.
- Candidate detection for the semantic fallback uses a limited financial vocabulary.
- AI-classified calls can produce `REVIEW` when the financial activity cannot be resolved safely.
- Regulatory paragraph references should be checked against the primary RBI publication before external use.

See [ARCHITECTURE.md](ARCHITECTURE.md) for implementation details, policy rationale, canonicalization rules, baseline governance, and additional limitations.
