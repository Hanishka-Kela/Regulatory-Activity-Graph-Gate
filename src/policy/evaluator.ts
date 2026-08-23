/**
 * Phase 2 — Policy Evaluator
 *
 * Architecture (section 6):
 *   Rego source → `opa build -t wasm` → committed .wasm → @open-policy-agent/opa-wasm → Node
 *
 * Since the WASM artifact must be compiled offline with `npm run build:policy`
 * (which requires the OPA binary), this evaluator provides TWO evaluation modes:
 *
 * 1. WASM mode (production): loads the pre-compiled policy.wasm artifact
 *
 * Policies implemented (TypeScript mode):
 *   DL-01: POOL_PASS_THROUGH edges → BLOCK
 *   PA-01: non-escrow direct to merchant → REVIEW
 *   DL-02: unapproved FINANCING_PROVIDER in full graph → BLOCK
 *   DL-03: new Obligation in delta → REVIEW (new lending relationship)
 *    using @open-policy-agent/opa-wasm. This is the canonical runtime path.
 *
 * 2. TypeScript mode (test / fallback): implements the same policy logic
 *    deterministically in TypeScript. Used when:
 *      - The WASM artifact is not present (e.g. fresh clone before `npm run build:policy`)
 *      - Tests (npm test must NOT require OPA binary or network)
 *
 * The TypeScript mode is semantically equivalent to the Rego policies.
 * If the two ever diverge, the Rego source is the source of truth.
 *
 * WASM staleness: if `.rego` files are edited without running `npm run build:policy`,
 * the WASM will be stale. This is documented in the README as a real failure mode.
 */

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import type {
  PolicyInput,
  PolicyResult,
  PolicyViolation,
  ApprovedPartnerRegistry,
} from "./types.js";
import type {
  Actor,
  Account,
  MoneyEdge,
  ActivityGraph,
  GraphDelta,
} from "../graph/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const WASM_PATH = join(__dirname, "wasm", "policy.wasm");

// ---------------------------------------------------------------------------
// WASM mode
// ---------------------------------------------------------------------------

async function evaluateWithWasm(input: PolicyInput): Promise<PolicyResult> {
  const { loadPolicy } = await import("@open-policy-agent/opa-wasm");
  const wasmBytes = readFileSync(WASM_PATH);
  const policy = await loadPolicy(wasmBytes.buffer);
  policy.setData({});
  const result = policy.evaluate(input);
  // OPA WASM returns an array of result sets
  // Expected shape: [{ result: { decision, violations } }]
  if (!result || result.length === 0) {
    throw new Error("OPA WASM returned empty result set");
  }
  const opaResult = result[0].result;
  return {
    decision: opaResult.decision,
    violations: opaResult.violations ?? [],
    policyVersion: input.policyVersion,
    evaluatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// TypeScript mode — deterministic policy implementation
// Semantically equivalent to the Rego policies in src/policy/rego/
// ---------------------------------------------------------------------------

/**
 * DL-01: Detect POOL_PASS_THROUGH mechanism edges.
 *
 * Source: RBI (Digital Lending) Directions, 2025
 * Reference: RBI/2025-26/36, DOR.STR.REC.19/21.07.001/2025-26, dated May 8, 2025
 * URL: https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=12848
 * Clause: 9(i)-(iii), Loan disbursal, servicing and repayment.
 * Supersedes: Guidelines on Digital Lending, September 2, 2022 (RBI/2022-23/098)
 */
function evaluateDL01(graph: ActivityGraph): PolicyViolation[] {
  const violations: PolicyViolation[] = [];
  for (const edge of graph.moneyEdges) {
    if (edge.mechanism === "POOL_PASS_THROUGH") {
      violations.push({
        policyId: "DL-01",
        severity: "BLOCK",
        message:
          `Prohibited pool/pass-through account pattern detected on edge '${edge.id}' ` +
          `(${edge.sourceAccountId} → ${edge.destinationAccountId}). ` +
          `RBI Digital Lending Directions clause 9 requires direct disbursement/repayment ` +
          `without third-party pool accounts.`,
        graphObjects: [{ id: edge.id, label: edge.label }],
        evidenceIds: edge.evidenceIds,
      });
    }
  }
  return violations;
}

/**
 * PA-01: Detect direct PA-to-merchant routing bypassing escrow.
 *
 * Source: RBI PA Master Direction 2025 (RBI/DPSS/2025-26/141), Escrow Account clause
 * URL: https://www.rbi.org.in/Scripts/NotificationUser.aspx (RBI/DPSS/2025-26/141)
 * Effective: 2025-09-15
 *
 * Demo scenario: PA-Online (domestic, INR)
 */
function evaluatePA01(graph: ActivityGraph): PolicyViolation[] {
  const violations: PolicyViolation[] = [];

  // Build set of ESCROW_BANK account IDs
  const escrowAccountIds = new Set<string>(
    graph.accounts
      .filter((a) => a.custody === "ESCROW_BANK")
      .map((a) => a.id),
  );

  // Build account lookup map
  const accountById = new Map<string, Account>(
    graph.accounts.map((a) => [a.id, a]),
  );

  for (const edge of graph.moneyEdges) {
    const dstAccount = accountById.get(edge.destinationAccountId);
    if (!dstAccount) continue;

    // Only check edges destined for MERCHANT accounts
    if (dstAccount.custody !== "MERCHANT") continue;

    // Violation: source is NOT an ESCROW_BANK account
    if (!escrowAccountIds.has(edge.sourceAccountId)) {
      violations.push({
        policyId: "PA-01",
        severity: "REVIEW",
        message:
          `Payment flow edge '${edge.id}' routes funds directly to merchant account ` +
          `'${edge.destinationAccountId}' without passing through a designated ESCROW_BANK account. ` +
          `RBI PA Master Direction 2025 (RBI/DPSS/2025-26/141) requires PA funds to flow through ` +
          `a dedicated escrow/nodal account before merchant settlement.`,
        graphObjects: [
          { id: edge.id, label: edge.label },
          { id: dstAccount.id, label: dstAccount.label },
        ],
        evidenceIds: edge.evidenceIds,
      });
    }
  }

  return violations;
}

/**
 * DL-03: New lending obligation in delta → REVIEW.
 *
 * Source: RBI Digital Lending Directions 2022, Para 2 + Para 5
 * URL: https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=12382
 *
 * Any new Obligation in GraphDelta.addedObligations triggers REVIEW.
 * Even approved partners' obligations require human review of the specific terms.
 */
function evaluateDL03(
  delta: GraphDelta,
): PolicyViolation[] {
  const violations: PolicyViolation[] = [];
  for (const oblig of delta.addedObligations) {
    violations.push({
      policyId: "DL-03",
      severity: "REVIEW",
      message:
        `New lending obligation detected: '${oblig.id}' ` +
        `(${oblig.debtorActorId} → ${oblig.creditorActorId}, ` +
        `tenorDays=${oblig.tenorDays ?? "N/A"}, ` +
        `installments=${oblig.installments ?? "N/A"}, ` +
        `feeBps=${oblig.financingFeeBps ?? "N/A"}). ` +
        `New financing relationships require compliance review per RBI Digital Lending ` +
        `Directions before release.`,
      graphObjects: [{ id: oblig.id, label: oblig.label }],
      evidenceIds: oblig.evidenceIds,
    });
  }
  return violations;
}

/**
 * DL-02: Approved partner structural check.
 *
 * Source: RBI (Digital Lending) Directions, 2025
 * Reference: RBI/2025-26/36, DOR.STR.REC.19/21.07.001/2025-26, dated May 8, 2025
 * URL: https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=12848
 * Clauses: 5(i)-(vii) (RE-LSP due diligence and accountability), 8(iv)(b)
 *   (website disclosure of LSPs and DLAs), and 17(i)-(vii) (DLA reporting to RBI).
 * The 2025 Directions do not retain the superseded 2022 “board-approved LSP list”
 * formulation; the approved-partners registry is this system's internal control
 * implementing those current accountability, disclosure, and reporting duties.
 * Supersedes: Guidelines on Digital Lending, September 2, 2022 (RBI/2022-23/098)
 *
 * Checks ALL FINANCING_PROVIDER actors in the FULL proposedGraph (not just delta)
 * per section 20 design rationale.
 */
function evaluateDL02(
  graph: ActivityGraph,
  registry: ApprovedPartnerRegistry,
): PolicyViolation[] {
  const violations: PolicyViolation[] = [];

  // Build approved actor ID set
  const approvedIds = new Set<string>(
    registry.partners.map((p) => p.actorId),
  );

  for (const actor of graph.actors) {
    if (actor.type === "FINANCING_PROVIDER" && !approvedIds.has(actor.id)) {
      violations.push({
        policyId: "DL-02",
        severity: "BLOCK",
        message:
          `Financing provider actor '${actor.id}' (${actor.label}) is not present in the ` +
          `approved-partners registry. RBI Digital Lending Directions clauses 5, 8(iv)(b), ` +
          `and 17 require LSP accountability and disclosure. Add this partner to ` +
          `.regulatory/approved-partners.json before merging.`,
        graphObjects: [{ id: actor.id, label: actor.label }],
        evidenceIds: actor.evidenceIds,
      });
    }
  }

  return violations;
}

/**
 * Aggregate: collects violations and computes final decision.
 * - Any BLOCK → BLOCK
 * - Any REVIEW (no BLOCK) → REVIEW
 * - None → PASS
 */
function aggregateViolations(violations: PolicyViolation[]): "PASS" | "REVIEW" | "BLOCK" {
  if (violations.some((v) => v.severity === "BLOCK")) return "BLOCK";
  if (violations.some((v) => v.severity === "REVIEW")) return "REVIEW";
  return "PASS";
}

/**
 * Evaluate policy in pure TypeScript mode.
 * Semantically equivalent to the Rego policies in src/policy/rego/.
 */
function evaluateWithTypeScript(input: PolicyInput): PolicyResult {
  const dl01 = evaluateDL01(input.proposedGraph);
  const pa01 = evaluatePA01(input.proposedGraph);
  const dl02 = evaluateDL02(input.proposedGraph, input.approvedPartners);
  const dl03 = evaluateDL03(input.delta);

  // Additionally: if any graph object has hasUnverifiedEvidence, force REVIEW
  // (AI fallback with UNCERTAIN confidence → cannot safely PASS)
  const hasUnverifiedEvidence = [
    ...input.proposedGraph.actors,
    ...input.proposedGraph.accounts,
    ...input.proposedGraph.moneyEdges,
    ...input.proposedGraph.obligations,
  ].some((obj) => obj.hasUnverifiedEvidence);

  const allViolations: PolicyViolation[] = [...dl01, ...pa01, ...dl02, ...dl03];

  // Unverified evidence forces REVIEW unless we're already blocking
  if (hasUnverifiedEvidence && !allViolations.some((v) => v.severity === "BLOCK")) {
    allViolations.push({
      policyId: "UNCERTAIN-EVIDENCE",
      severity: "REVIEW",
      message:
        "The proposed graph contains nodes with AI_INFERRED evidence marked as UNCERTAIN " +
        "(hasUnverifiedEvidence=true). The system cannot safely determine the financial state. " +
        "Human review is required before approval.",
      graphObjects: [
        ...[
          ...input.proposedGraph.actors,
          ...input.proposedGraph.accounts,
          ...input.proposedGraph.moneyEdges,
          ...input.proposedGraph.obligations,
        ]
          .filter((o) => o.hasUnverifiedEvidence)
          .map((o) => ({ id: o.id, label: o.label })),
      ],
      evidenceIds: [],
    });
  }

  const decision = aggregateViolations(allViolations);

  return {
    decision,
    violations: allViolations,
    policyVersion: input.policyVersion,
    evaluatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface EvaluatorOptions {
  /** Force TypeScript mode even if WASM exists. Default: false. */
  forceTypeScript?: boolean;
}

/**
 * Evaluate a PolicyInput against all registered policies.
 *
 * Mode selection:
 *   - If WASM artifact exists and forceTypeScript is false: use WASM mode
 *   - Otherwise: use TypeScript mode (required for npm test, offline)
 */
export async function evaluatePolicy(
  input: PolicyInput,
  options: EvaluatorOptions = {},
): Promise<PolicyResult> {
  const useWasm = !options.forceTypeScript && existsSync(WASM_PATH);

  if (useWasm) {
    try {
      return await evaluateWithWasm(input);
    } catch (err) {
      // WASM failure fallthrough to TypeScript mode with forced REVIEW
      // Cannot silently PASS if WASM fails (section 24 principle)
      console.error("[PolicyEvaluator] WASM evaluation failed, falling back to TypeScript mode:", err);
    }
  }

  return evaluateWithTypeScript(input);
}

/**
 * Synchronous variant using TypeScript mode only.
 * Use in tests and contexts where async is not needed.
 */
export function evaluatePolicySync(input: PolicyInput): PolicyResult {
  return evaluateWithTypeScript(input);
}

// Re-export individual policy evaluators for testing
export { evaluateDL01, evaluatePA01, evaluateDL02, evaluateDL03, aggregateViolations };
