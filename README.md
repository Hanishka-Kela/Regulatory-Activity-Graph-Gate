# Regulatory Activity Graph Gate

Regulatory Activity Graph Gate checks whether a TypeScript change changes approved financial activity before it is released. It extracts evidence from source code, models the related money movement and lending activity as a graph, then compares it with an approved baseline.

It was built for Track 05 — Open Track of the Razorpay AI Buildathon as an AI-assisted pre-release engineering control for material or uncertain changes in a fintech application's financial activity topology.

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

The CLI, tests, and GitHub Action use the deterministic TypeScript policy evaluator. Rego mirrors the policy logic and provides an optional WASM execution path after compilation.

## Demo cases

| Case | Scenario | Decision |
|------|----------|----------|
| 1 | Logging rename, no topology change | `PASS` |
| 2 | Partner X NBFC, 90-day installment plan, approved partner | `REVIEW` |
| 3 | Loan disbursal through a third-party pool account | `BLOCK` |
| 4 | `routePayment(paymentConfig.destination, payload)` — uncertain AI | `REVIEW` |

## Policies

| ID | Rule | Severity | Source |
|----|------|----------|--------|
| DL-01 | Pool/pass-through edge directly involving an account owned by the financing-provider creditor of a lending obligation | **BLOCK** | RBI (Digital Lending) Directions, 2025, Paragraph 9 |
| PA-01 | Direct non-escrow-to-merchant topology heuristic | **REVIEW** | RBI (Regulation of Payment Aggregators) Directions, 2025, Chapter V, Paragraphs 16–18 |
| DL-02 | `FINANCING_PROVIDER` actor not in approved-partners registry | **BLOCK** | Para 17–derived internal governance control *(not a direct CIMS-compliance test; see `policy-sources/dl-02.json`)* |
| DL-03 | New `Obligation` appears in delta (new lending relationship) | **REVIEW** | Project-defined safety-net rule, not a specific RBI clause — see `policy-sources/dl-03.json` |

Policy metadata and primary RBI links are stored in `policy-sources/`. The prototype flags topology matching a configured policy and requires compliance review; it does not establish a legal violation.

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
- Graph extraction may omit context needed to assess regulatory exceptions or reach a legal conclusion.
- DL-01 associates only edge endpoints with the creditor financing provider; it does not trace indirect multi-hop ownership paths.

The offline candidate-triage evaluation set and its measured results are in [docs/evaluation.md](docs/evaluation.md).

See [ARCHITECTURE.md](ARCHITECTURE.md) for implementation details, policy rationale, canonicalization rules, baseline governance, and additional limitations.
