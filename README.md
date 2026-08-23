# Regulatory Activity Graph Gate

**A release gate that detects when a software change silently alters approved financial activity topology.**

## The Central Question

> Did this engineering change materially change the financial activity topology that was previously approved?

Normal Git detects _what source code changed_. This system detects _what financial behaviour changed because of that source-code change_.

---

## Quickstart

```bash
npm install
npm test
```

No API key. No OPA binary. No network. No database. All tests run offline.

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
| DL-01 | Pool/pass-through account detected (`POOL_PASS_THROUGH` mechanism) | **BLOCK** | RBI (Digital Lending) Directions, 2025, clause 9(i)-(iii) |
| PA-01 | PA funds reach merchant without ESCROW_BANK intermediary | **REVIEW** | RBI PA Master Direction 2025, RBI/DPSS/2025-26/141 |
| DL-02 | `FINANCING_PROVIDER` actor not in approved-partners registry | **BLOCK** | RBI (Digital Lending) Directions, 2025, clauses 5, 8(iv)(b), and 17; internal registry control |
| DL-03 | New `Obligation` appears in delta (new lending relationship) | **REVIEW** | RBI Digital Lending Guidelines 2022, Para 2+5 |

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

1. **No separate `changedAccounts`**: Account identity includes `id + ownerActorId + custody`, so changes to any of those fields appear as remove+add. No account change is invisible to this identity model.

2. **No WASM artifact committed**: OPA binary is required to build `policy.wasm`. Tests use the TypeScript evaluator. Compile with `npm run build:policy` and commit the WASM before deploying the WASM runtime path.

3. **PA-01 scope**: Only covers PA-Online (domestic INR) flows. PA-CB and PA-P have different requirements not encoded here.

4. **Phase 3–7 not yet implemented**: Evidence extraction (ts-morph), AI semantic fallback, CLI, GitHub Action, Docker are pending.

---

## Phases

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Graph types, canonicalization, hashing, diff, fixtures, replay tests | ✅ Done (57 tests) |
| 2 | OPA/Rego policies, TypeScript evaluator, policy tests | ✅ Done (61 tests) |
| 3 | EvidenceAtom extraction (ts-morph adapters) | ⏳ Pending |
| 4 | ActivityGraphBuilder from EvidenceAtoms | ⏳ Pending |
| 5 | AI semantic fallback (offline fixture mode) | ⏳ Pending |
| 6 | CLI + GitHub Action | ⏳ Pending |
| 7 | Audit artifacts, Docker, demo prep | ⏳ Pending |
