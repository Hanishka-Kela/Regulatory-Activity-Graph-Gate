/**
 * Phase 2 — Policy types
 *
 * PolicyInput, PolicyOutput, PolicyViolation, PolicyResult, ApprovedPartnerRegistry
 *
 * Decision enum: PASS | REVIEW | BLOCK
 * Display label for REVIEW: "REVIEW_REQUIRED" (presentation layer only)
 * REVIEW_REQUIRED must NOT exist in the type system.
 */

import type { ActivityGraph, GraphDelta } from "../graph/types.js";

// ---------------------------------------------------------------------------
// Approved Partner Registry (section 22)
// ---------------------------------------------------------------------------

export type PartnerRole =
  | "LENDING_SERVICE_PROVIDER"  // LSP under RBI DL Directions
  | "PAYMENT_AGGREGATOR"        // PA under RBI PA MD
  | "TECHNOLOGY_PROVIDER"       // Neutral tech provider (no regulated role)
  | "NBFC"                      // Non-Banking Financial Company
  | "BANK";                     // Scheduled Commercial Bank

export interface ApprovedPartner {
  actorId: string;
  name: string;
  roles: PartnerRole[];
  approvedAt: string;   // ISO 8601
  approvedBy: string;   // internal approver identifier
  notes?: string;
}

export interface ApprovedPartnerRegistry {
  version: string;
  updatedAt: string;
  partners: ApprovedPartner[];
}

// ---------------------------------------------------------------------------
// Policy Input (section 20)
// ---------------------------------------------------------------------------

/**
 * Full policy input. Includes proposedGraph (not just delta) to support
 * DL-02's allowlist check on actors that may pre-exist in the graph.
 *
 * STRICT CONSTRAINT: No raw source code, no raw LLM output, no PR description
 * text reaches the policy engine.
 */
export interface PolicyInput {
  delta: GraphDelta;
  proposedGraph: ActivityGraph;
  approvedPartners: ApprovedPartnerRegistry;
  policyVersion: string;
}

// ---------------------------------------------------------------------------
// Policy Violation (section 21)
// ---------------------------------------------------------------------------

export interface PolicyViolation {
  policyId: string;
  severity: "REVIEW" | "BLOCK";
  message: string;
  graphObjects: { id: string; label: string }[];
  evidenceIds: string[];
}

// ---------------------------------------------------------------------------
// Policy Result (section 21)
// ---------------------------------------------------------------------------

/**
 * Decision enum: exactly three values — PASS, REVIEW, BLOCK.
 * Display label "REVIEW_REQUIRED" is derived from REVIEW at the presentation
 * layer (CLI, GitHub Check output). It must NOT leak into this type.
 */
export interface PolicyResult {
  decision: "PASS" | "REVIEW" | "BLOCK";
  violations: PolicyViolation[];
  policyVersion: string;
  evaluatedAt: string;
}
