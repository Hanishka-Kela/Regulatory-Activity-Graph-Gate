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

## Repository Structure

```
.
├── .regulatory/
│   ├── approved-baseline.json   # Pinned, versioned approved baseline (DO NOT auto-regenerate)
│   └── approved-partners.json  # Approved partner registry (requires compliance team approval to modify)
├── fixtures/
│   ├── baseline.ts              # Approved PA flow topology
│   ├── case-pass.ts             # CASE 1: logging rename → PASS
│   ├── case-review.ts           # CASE 2: Partner X installment plan → REVIEW
│   ├── case-block.ts            # CASE 3: pool pass-through → BLOCK
│   └── case-ambiguous.ts        # CASE 4: AI uncertain evidence → REVIEW
├── policy-sources/
│   ├── dl-01.json               # DL-01 primary RBI source metadata
│   ├── pa-01.json               # PA-01 primary RBI source metadata
│   ├── dl-02.json               # DL-02 primary RBI source metadata
│   └── dl-03.json               # DL-03 primary RBI source metadata
├── src/
│   ├── graph/
│   │   ├── types.ts             # Core types (Actor, Account, MoneyEdge, Obligation, GraphDelta)
│   │   ├── canonical.ts         # SHA-256 hashing (Category A fields only)
│   │   ├── diff.ts              # ΔG = G_proposed − G_baseline
│   │   └── builder.ts           # ActivityGraphBuilder with Zod validation
│   └── policy/
│       ├── types.ts             # PolicyInput, PolicyResult, ApprovedPartnerRegistry
│       ├── evaluator.ts         # Dual-mode evaluator (WASM + TypeScript fallback)
│       └── rego/
│           ├── dl-01.rego       # Pool pass-through prohibition
│           ├── pa-01.rego       # PA escrow topology check
│           ├── dl-02.rego       # Approved partner structural check
│           ├── dl-03.rego       # New lending obligation → REVIEW
│           └── main.rego        # Aggregate policy
├── tests/
│   ├── graph/
│   │   ├── canonical.test.ts    # Hash stability, Category A/B/C separation
│   │   ├── diff.test.ts         # Delta computation for all 4 cases
│   │   ├── hash-collision.test.ts # Different identities → different hashes
│   │   └── replay.test.ts       # 100-replay hash + delta stability
│   └── policy/
│       ├── dl-01.test.ts        # DL-01 violation/pass cases
│       ├── pa-01.test.ts        # PA-01 violation/pass cases
│       ├── dl-02.test.ts        # DL-02 allowlisted/blocked cases
│       └── evaluator.test.ts    # End-to-end for all 4 demo cases
└── scripts/
    ├── build-policy.ts          # Compile Rego → WASM (requires OPA binary)
    └── generate-baseline.ts     # Generate approved-baseline.json (one-time)
```

---

## Schema Version: 2 (Phase 1 Corrected)

### Account.custody (section 13)
```
CUSTOMER | MERCHANT | RE | ESCROW_BANK | THIRD_PARTY | UNKNOWN
```
_(Previous Phase 1 draft had `PROVIDER` — rejected by Zod runtime.)_

### MoneyEdge.mechanism (section 14)
```
DIRECT_BANK_TRANSFER | INTERNAL_LEDGER_TRANSFER | ESCROW |
EXTERNAL_API_ROUTING | POOL_PASS_THROUGH | UNKNOWN
```
_(Previous Phase 1 draft had `DIRECT_TRANSFER` / `INTERNAL_LEDGER` / `EXTERNAL_API` — rejected by Zod runtime.)_

### MoneyEdge.settlementDelayDays
Flattened top-level field. **Never** use the old `timing.delayDays` nested form.

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
| DL-02 | `FINANCING_PROVIDER` actor not in approved-partners registry | **BLOCK** | RBI (Digital Lending) Directions, 2025, Para 17 *(strong confidence — see `policy-sources/dl-02.json`)* |
| DL-03 | New `Obligation` appears in delta (new lending relationship) | **REVIEW** | Project-defined safety-net rule, not a specific RBI clause — see `policy-sources/dl-03.json` |

DL-01 and DL-02 were originally cited against the September 2022 Guidelines on Digital Lending. That document was consolidated and replaced by the RBI (Digital Lending) Directions, 2025 (effective May 8, 2025); both citations have been updated accordingly. The exact paragraph numbers above come from cross-validated secondary sources, not a direct read of RBI's primary PDF (which is CAPTCHA-gated) — treat them as strong leads, not settled fact, and re-verify against the primary source before quoting a paragraph number in any external-facing submission material.

Each policy has a corresponding source metadata file in `policy-sources/`.

---

## Canonicalization Rules

Three categories of graph fields:

| Category | Fields | Participates in hash? |
|----------|--------|----------------------|
| A — Financial semantics | `id`, `type`, `custody`, `mechanism`, `settlementDelayDays`, endpoint IDs, obligation terms | ✅ Yes |
| B — Display provenance | `label`, `evidenceIds`, source spans, file paths | ❌ No |
| C — Trust metadata | `derivation`, `confidence`, `hasUnverifiedEvidence` | ❌ No |

**Same financial topology + different evidence quality = same graph hash, potentially different policy result.**

---

## OPA/Rego → WASM Pipeline

> ⚠️ **`npm test` does NOT require OPA installed.** Tests use the TypeScript evaluator.

### Building WASM

```bash
# Install OPA (macOS)
brew install opa

# Compile Rego to WASM
npm run build:policy
```

The compiled `src/policy/wasm/policy.wasm` must be committed. If `.rego` files are edited without rebuilding:

> **WASM STALENESS WARNING**: The committed `.wasm` artifact will be stale. Production runtime via WASM will reflect outdated policy logic. Always run `npm run build:policy` after editing `.rego` files and commit the updated artifact.

### Policy Evaluation Modes

1. **WASM mode** (production): `src/policy/wasm/policy.wasm` exists → `@open-policy-agent/opa-wasm`
2. **TypeScript mode** (tests / offline): Semantically equivalent TypeScript implementation

---

## Baseline Model

The baseline is **`.regulatory/approved-baseline.json`** — a pinned, versioned, explicitly approved artifact.

> **Never auto-regenerate the baseline at runtime.** Baseline updates require an explicit approval action.

To regenerate (compliance team only):
```bash
npm run generate:baseline
# Review the hash change, get approval, then commit
```

---

## Approved Partner Registry

`.regulatory/approved-partners.json` is an explicitly versioned approval artifact.

- The policy engine reads it to check DL-02
- The graph extractor does **not** read it
- Modifications require compliance team approval

---

## Decision Values

```typescript
type Decision = "PASS" | "REVIEW" | "BLOCK";
```

`REVIEW` is displayed as `"REVIEW_REQUIRED"` in CLI output and GitHub Check — this is a **presentation-layer label only**. `REVIEW_REQUIRED` must never appear in the type system.

**Exit codes** (CLI):
- `0` = PASS
- `1` = BLOCK
- `2` = REVIEW

---

## Known Limitations

1. **No `changedAccounts` bucket — not actually a limitation**: Account identity is `(id, ownerActorId, custody)`. Since owner and custody are themselves part of identity, an account's owner or custody cannot change while its identity stays the same — any such change is already fully captured as remove+add, the same way a `MoneyEdge` destination change is. An earlier version of this note incorrectly described a scenario that's impossible given the identity definition; corrected.

2. **No WASM artifact committed**: OPA binary is required to build `policy.wasm`. Tests use the TypeScript evaluator. Compile with `npm run build:policy` and commit the WASM before deploying the WASM runtime path.

3. **PA-01 scope**: Only covers PA-Online (domestic INR) flows. PA-CB and PA-P have different requirements not encoded here.

4. **Deterministic extraction scope**: Phase 3 recognizes only the three documented SDK call shapes after AST declaration resolution. Unmatched or ambiguous calls deliberately produce no deterministic evidence; they are Phase 5's semantic-fallback boundary.

5. **Semantic fallback vocabulary**: Candidate triage covers the four demo cases, not every financial verb. A live OpenAI response has not been exercised in this repository; tests and the default no-key path use recorded replay or fail safely to REVIEW.

6. **Audit output**: Every CLI evaluation writes six JSON side-channel artifacts to ignored `audit-output/`; these files are never read back into the release decision.

---


---

For implementation details, policy rationale, canonicalization rules, and known limitations, see [ARCHITECTURE.md](ARCHITECTURE.md).
