# Architecture and Maintainer Notes

Regulatory Activity Graph Gate evaluates the full TypeScript source snapshot at an evaluated commit, extracts grounded evidence, builds a canonical financial-activity graph, diffs it against the explicitly approved baseline, and applies deterministic policy.

## Repository map

- `src/graph/` — frozen graph contracts, construction, canonical hashing, and diffs.
- `src/policy/` — Rego sources and the deterministic evaluator.
- `src/evidence/` — ts-morph adapters and Gemini semantic fallback.
- `src/cli/` — release-gate command and audit side effects.
- `fixtures/` — source and graph fixtures for the four demo cases.
- `policy-sources/` — citation/rationale metadata, including `EXTRACTION_FAILSAFE`.

## Capability inventory

- **Graph model and canonicalization** — stable financial-topology identity, graph hashing, and baseline/proposed deltas.
- **Policy engine** — four scoped RBI/project safety rules with TypeScript evaluation and optional Rego/WASM runtime.
- **Deterministic extraction** — AST-backed evidence for three known financial SDK adapters.
- **Semantic fallback** — Gemini-assisted normalization of unresolved candidate calls, with Zod validation and fail-safe REVIEW.
- **Release gate** — Commander CLI and GitHub Actions required check with PASS/BLOCK/REVIEW exit semantics.
- **Audit trail** — six JSON side-channel artifacts written per CLI evaluation.

## Canonicalization

Financial identity is hashed independently of labels, evidence IDs, derivation, and trust metadata. Actor identity includes `id` and type; account identity includes `id`, owner, and custody; money-edge identity is source/destination accounts; obligation identity is debtor/creditor actors. Trust metadata remains available to policy without changing topology identity.

## Policy runtime

The TypeScript evaluator is authoritative in offline tests. Rego/WASM remains the intended production runtime when a compiled policy artifact is available. The approved baseline is a pinned `.regulatory/approved-baseline.json` artifact and is never reconstructed during evaluation.

## Known limitations

- Deterministic extraction recognizes only three scoped SDK call shapes.
- Semantic candidate verbs are scoped to the demo, not all financial vocabulary.
- The semantic fallback uses Gemini `gemini-3.6-flash` for unresolved financial calls. Responses are validated with Zod; validated evidence, graph construction, and policy evaluation remain provider-independent.
- Provider failure, timeout after one retry, or schema-invalid output always produces `EXTRACTION_FAILSAFE` REVIEW.
- Audit JSON is generated under ignored `audit-output/` and is never read into a decision.
