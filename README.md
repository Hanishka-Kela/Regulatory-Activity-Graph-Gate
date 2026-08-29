# Regulatory Activity Graph Gate

**A release gate that detects when an engineering change silently alters approved financial activity topology.**

For fintech teams, a harmless-looking code or configuration change can reroute funds, add a lending relationship, or bypass an approved settlement path. This gate turns the evaluated source snapshot into a financial activity graph and blocks or flags material changes before release.

## The Central Question

> Did this engineering change materially change the financial activity topology that was previously approved?

Normal Git detects _what source code changed_. This system detects _what financial behaviour changed because of that source-code change_.

---

## Quickstart

```bash
npm install
npm test
```

Run a real source evaluation:

```bash
npm run cli -- evaluate --baseline .regulatory/approved-baseline.json --source fixtures/source/block-flow.ts --json
```

No API key. No OPA binary. No network. No database. All tests run offline.

> Buildathon deviation: the live semantic fallback uses Gemini (`GEMINI_API_KEY`) rather than the originally specified OpenAI provider for cost reasons. It pins `gemini-3.6-flash`, selected for current account availability and lower contention than Gemini 3.7 Flash on this single-shot extraction task. Live validation confirmed the unresolved routing case reaches normal `UNCERTAIN-EVIDENCE` REVIEW while the locally defined decoy client remains PASS. Offline tests never call either provider; validated evidence, graph construction, and policy evaluation remain provider-independent.

---

## Demo Cases

| Case | Scenario | Decision |
|------|----------|----------|
| 1 | Logging rename, no topology change | `PASS` |
| 2 | Partner X NBFC, 90-day installment plan, approved partner | `REVIEW` |
| 3 | Pool/treasury account replaces escrow | `BLOCK` |
| 4 | `routePayment(paymentConfig.destination, payload)` — uncertain AI | `REVIEW` |

---

## Implemented Policies

| ID | Rule | Severity | Source |
|----|------|----------|--------|
| DL-01 | Pool/pass-through account detected (`POOL_PASS_THROUGH` mechanism) | **BLOCK** | RBI (Digital Lending) Directions, 2025, Para 9 *(moderate confidence — see `policy-sources/dl-01.json`)* |
| PA-01 | PA funds reach merchant without ESCROW_BANK intermediary | **REVIEW** | RBI PA Master Direction 2025, RBI/DPSS/2025-26/141 |
| DL-02 | `FINANCING_PROVIDER` actor not in approved-partners registry | **BLOCK** | Para 17–derived internal governance control *(not a direct CIMS-compliance test; see `policy-sources/dl-02.json`)* |
| DL-03 | New `Obligation` appears in delta (new lending relationship) | **REVIEW** | Project-defined safety-net rule, not a specific RBI clause — see `policy-sources/dl-03.json` |

DL-01 and DL-02 were originally cited against the September 2022 Guidelines on Digital Lending. That document was consolidated and replaced by the RBI (Digital Lending) Directions, 2025 (effective May 8, 2025). Para 9 addresses direct loan disbursal and repayment, while Para 17 requires reporting deployed DLAs to RBI's CIMS portal. DL-02 is intentionally an internal pre-release control derived from the latter obligation; it does not claim to prove CIMS compliance. RBI's primary page blocks automated retrieval, so re-check the primary notice before quoting a paragraph in external submission material.

Each policy has a corresponding source metadata file in `policy-sources/`.

---

## Architecture at a glance

- `src/graph/` — financial topology, canonical hashes, and deltas.
- `src/policy/` — deterministic policy evaluation.
- `src/evidence/` — AST extraction and semantic fallback.
- `src/cli/` — release command and audit artifacts.
- `fixtures/` and `policy-sources/` — demo inputs and policy rationale.

For implementation details, policy rationale, canonicalization rules, baseline governance, and known limitations, see [ARCHITECTURE.md](ARCHITECTURE.md).
