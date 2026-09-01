/**
 * Phase 2 — Policy Evaluator
 *
 * The deterministic TypeScript implementation is the current authoritative
 * runtime used by the CLI, tests, and GitHub Action. Policies implemented:
 *   DL-01: POOL_PASS_THROUGH edges in lending context → BLOCK
 *   PA-01: non-escrow direct to merchant → REVIEW
 *   DL-02: unapproved FINANCING_PROVIDER in full graph → BLOCK
 *   DL-03: new Obligation in delta → REVIEW (new lending relationship)
 *
 * Rego sources mirror this logic. The async evaluatePolicy API optionally uses
 * a compiled Rego/WASM artifact when present; the active release CLI calls
 * evaluatePolicySync and therefore does not invoke that optional path.
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
 * DL-01: Detect POOL_PASS_THROUGH mechanism edges in lending context.
 *
 * Source: RBI (Digital Lending) Directions, 2025, Paragraph 9.
 * RBI/2025-26/36; DOR.STR.REC.19/21.07.001/2025-26; May 8, 2025.
 * URL: https://www.rbi.org.in/scripts/NotificationUser.aspx?Id=12848&Mode=0
 */
function evaluateDL01(graph: ActivityGraph): PolicyViolation[] {
  const violations: PolicyViolation[] = [];
  const financingProviderIds = new Set<string>(
    graph.actors.filter((actor) => actor.type === "FINANCING_PROVIDER").map((actor) => actor.id),
  );
  const lendingCreditorIds = new Set<string>(
    graph.obligations
      .filter((obligation) => financingProviderIds.has(obligation.creditorActorId))
      .map((obligation) => obligation.creditorActorId),
  );
  const accountById = new Map<string, Account>(
    graph.accounts.map((account) => [account.id, account]),
  );

  for (const edge of graph.moneyEdges) {
    const sourceOwnerId = accountById.get(edge.sourceAccountId)?.ownerActorId;
    const destinationOwnerId = accountById.get(edge.destinationAccountId)?.ownerActorId;
    const involvesLendingCreditor =
      (sourceOwnerId !== undefined && lendingCreditorIds.has(sourceOwnerId)) ||
      (destinationOwnerId !== undefined && lendingCreditorIds.has(destinationOwnerId));

    if (edge.mechanism === "POOL_PASS_THROUGH" && involvesLendingCreditor) {
      violations.push({
        policyId: "DL-01",
        severity: "BLOCK",
        message:
          `Pool/pass-through account topology detected on edge '${edge.id}' ` +
          `(${edge.sourceAccountId} → ${edge.destinationAccountId}). ` +
          `Configured prototype policy DL-01 flags this lending-context topology for compliance review under ` +
          `RBI (Digital Lending) Directions, 2025, Paragraph 9; this result does not by itself establish a legal violation.`,
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
 * Source: RBI (Regulation of Payment Aggregators) Directions, 2025,
 * Chapter V, Paragraphs 16–18. RBI/DPSS/2025-26/141;
 * CO.DPSS.POLC.No.S-633/02-14-008/2025-26.
 * URL: https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12896
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
          `Configured prototype policy PA-01 flags this as a REVIEW heuristic under ` +
          `RBI (Regulation of Payment Aggregators) Directions, 2025, Chapter V, Paragraphs 16–18. ` +
          `The graph may not contain the full payment flow, so this result does not establish a legal violation.`,
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
 * Status: PROJECT-DEFINED SAFETY-NET RULE, not a specific numbered RBI clause.
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
        `New financing relationships always require human compliance review ` +
        `before release, per project policy DL-03 (see policy-sources/dl-03.json for rationale).`,
      graphObjects: [{ id: oblig.id, label: oblig.label }],
      evidenceIds: oblig.evidenceIds,
    });
  }
  return violations;
}

/**
 * DL-02: Approved partner structural check.
 *
 * Source context: RBI (Digital Lending) Directions, 2025, Paragraph 17.
 * RBI/2025-26/36; DOR.STR.REC.19/21.07.001/2025-26; May 8, 2025.
 * URL: https://www.rbi.org.in/scripts/NotificationUser.aspx?Id=12848&Mode=0
 * This is a project-defined internal governance control derived from the need
 * to track financing providers and maintain accurate regulatory reporting. It
 * does not directly implement Paragraph 17 or prove CIMS compliance.
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
          `approved-partners registry. Project-defined internal governance control DL-02, derived from ` +
          `the reporting context in RBI (Digital Lending) Directions, 2025, Paragraph 17, requires ` +
          `review before merging. It does not prove CIMS compliance.`,
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
  /** Force the authoritative TypeScript implementation in the optional async API. */
  forceTypeScript?: boolean;
}

/**
 * Evaluate a PolicyInput against all registered policies.
 *
 * Optional async API: uses WASM when an artifact exists unless TypeScript is
 * forced. The CLI, tests, and GitHub Action use evaluatePolicySync instead.
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
      // If the optional WASM path fails, evaluation falls back to the current
      // authoritative TypeScript implementation.
      console.error("[PolicyEvaluator] WASM evaluation failed, falling back to TypeScript mode:", err);
    }
  }

  return evaluateWithTypeScript(input);
}

/**
 * Current authoritative runtime used by the CLI, tests, and GitHub Action.
 */
export function evaluatePolicySync(input: PolicyInput): PolicyResult {
  return evaluateWithTypeScript(input);
}

// Re-export individual policy evaluators for testing
export { evaluateDL01, evaluatePA01, evaluateDL02, evaluateDL03, aggregateViolations };
