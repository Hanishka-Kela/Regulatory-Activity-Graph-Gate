/**
 * Phase 2 tests: End-to-end policy evaluator
 *
 * Tests the full pipeline: PolicyInput → evaluatePolicySync → PolicyResult
 * for all four demo cases using the TypeScript evaluator (offline, no OPA binary).
 *
 * Tests:
 * - CASE 1 (PASS): empty delta, decision = PASS
 * - CASE 2 (REVIEW): new obligation, Partner X approved, decision = REVIEW (DL-01 area)
 * - CASE 3 (BLOCK): POOL_PASS_THROUGH, decision = BLOCK
 * - CASE 4 (AMBIGUOUS): hasUnverifiedEvidence=true, decision = REVIEW
 * - Decision enum: exactly PASS | REVIEW | BLOCK (not REVIEW_REQUIRED)
 * - Policy is deterministic: 100 replays → same result
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { evaluatePolicySync } from "../../src/policy/evaluator.js";
import type { PolicyInput } from "../../src/policy/types.js";
import type { ApprovedPartnerRegistry } from "../../src/policy/types.js";
import { baselineGraph } from "../../fixtures/baseline.js";
import { passGraph } from "../../fixtures/case-pass.js";
import { reviewGraph } from "../../fixtures/case-review.js";
import { blockGraph } from "../../fixtures/case-block.js";
import { ambiguousGraph, buildAmbiguousGraph } from "../../fixtures/case-ambiguous.js";
import { computeGraphDelta } from "../../src/graph/diff.js";

const POLICY_VERSION = "1.0.0";

const approvedRegistry: ApprovedPartnerRegistry = {
  version: "1.0.0",
  updatedAt: "2026-08-23T00:00:00Z",
  partners: [
    {
      actorId: "actor:partner_x",
      name: "Partner X NBFC",
      roles: ["LENDING_SERVICE_PROVIDER", "NBFC"],
      approvedAt: "2026-01-15T00:00:00Z",
      approvedBy: "compliance-team@razorpay.com",
    },
  ],
};

const emptyRegistry: ApprovedPartnerRegistry = {
  version: "1.0.0",
  updatedAt: "2026-08-23T00:00:00Z",
  partners: [],
};

// ---------------------------------------------------------------------------
// CASE 1 — PASS
// ---------------------------------------------------------------------------
describe("CASE 1 — PASS: logging rename, empty delta", () => {
  const input: PolicyInput = {
    delta: computeGraphDelta(baselineGraph, passGraph),
    proposedGraph: passGraph,
    approvedPartners: approvedRegistry,
    policyVersion: POLICY_VERSION,
  };

  it("decision is PASS", () => {
    const result = evaluatePolicySync(input);
    expect(result.decision).toBe("PASS");
  });

  it("no violations", () => {
    const result = evaluatePolicySync(input);
    expect(result.violations).toHaveLength(0);
  });

  it("policyVersion is preserved", () => {
    const result = evaluatePolicySync(input);
    expect(result.policyVersion).toBe(POLICY_VERSION);
  });

  it("evaluatedAt is an ISO 8601 string", () => {
    const result = evaluatePolicySync(input);
    expect(() => new Date(result.evaluatedAt)).not.toThrow();
    expect(new Date(result.evaluatedAt).toISOString()).toBe(result.evaluatedAt);
  });
});

// ---------------------------------------------------------------------------
// CASE 2 — REVIEW
// ---------------------------------------------------------------------------
describe("CASE 2 — REVIEW: Partner X installment plan, approved partner", () => {
  const input: PolicyInput = {
    delta: computeGraphDelta(baselineGraph, reviewGraph),
    proposedGraph: reviewGraph,
    approvedPartners: approvedRegistry,
    policyVersion: POLICY_VERSION,
  };

  it("decision is REVIEW", () => {
    const result = evaluatePolicySync(input);
    expect(result.decision).toBe("REVIEW");
  });

  it("decision is NOT REVIEW_REQUIRED (REVIEW_REQUIRED must not exist in type system)", () => {
    const result = evaluatePolicySync(input);
    expect(result.decision).not.toBe("REVIEW_REQUIRED");
    expect(result.decision).toBe("REVIEW");
  });

  it("has at least one REVIEW violation", () => {
    const result = evaluatePolicySync(input);
    expect(result.violations.some((v) => v.severity === "REVIEW")).toBe(true);
  });

  it("DL-03 fires (new obligation always requires review, even for approved partners) — regression test: main.rego previously omitted the dl03 import from its aggregate decision, so this assertion exists specifically to catch that class of bug again", () => {
    const result = evaluatePolicySync(input);
    expect(result.violations.some((v) => v.policyId === "DL-03")).toBe(true);
  });

  it("no BLOCK violations (Partner X is approved)", () => {
    const result = evaluatePolicySync(input);
    expect(result.violations.some((v) => v.severity === "BLOCK")).toBe(false);
  });

  it("DL-02 does NOT fire for approved Partner X", () => {
    const result = evaluatePolicySync(input);
    expect(result.violations.some((v) => v.policyId === "DL-02")).toBe(false);
  });

  it("does not add a duplicate generic topology review", () => {
    const result = evaluatePolicySync(input);
    expect(result.violations.some((v) => v.policyId === "TOPOLOGY-CHANGE")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CASE 2 — BLOCK (when Partner X is NOT approved)
// ---------------------------------------------------------------------------
describe("CASE 2 — BLOCK: Partner X NOT in registry → DL-02 fires", () => {
  const input: PolicyInput = {
    delta: computeGraphDelta(baselineGraph, reviewGraph),
    proposedGraph: reviewGraph,
    approvedPartners: emptyRegistry,
    policyVersion: POLICY_VERSION,
  };

  it("decision is BLOCK when partner is unapproved", () => {
    const result = evaluatePolicySync(input);
    expect(result.decision).toBe("BLOCK");
  });

  it("DL-02 violation present", () => {
    const result = evaluatePolicySync(input);
    expect(result.violations.some((v) => v.policyId === "DL-02")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CASE 3 — BLOCK
// ---------------------------------------------------------------------------
describe("CASE 3 — BLOCK: loan disbursal through a third-party pool", () => {
  const input: PolicyInput = {
    delta: computeGraphDelta(baselineGraph, blockGraph),
    proposedGraph: blockGraph,
    approvedPartners: approvedRegistry,
    policyVersion: POLICY_VERSION,
  };

  it("decision is BLOCK", () => {
    const result = evaluatePolicySync(input);
    expect(result.decision).toBe("BLOCK");
  });

  it("DL-01 violation present", () => {
    const result = evaluatePolicySync(input);
    expect(result.violations.some((v) => v.policyId === "DL-01")).toBe(true);
  });

  it("DL-01 violation has BLOCK severity", () => {
    const result = evaluatePolicySync(input);
    const dl01 = result.violations.find((v) => v.policyId === "DL-01");
    expect(dl01?.severity).toBe("BLOCK");
  });

  it("does not fire PA-01 because the flow ends at a borrower, not a merchant", () => {
    const result = evaluatePolicySync(input);
    expect(result.violations.some((v) => v.policyId === "PA-01")).toBe(false);
  });

  it("does not add a generic review alongside a specific BLOCK", () => {
    const result = evaluatePolicySync(input);
    expect(result.violations.some((v) => v.policyId === "TOPOLOGY-CHANGE")).toBe(false);
  });
});

describe("TOPOLOGY-CHANGE fallback", () => {
  const evaluate = (baseline: typeof baselineGraph, proposed: typeof baselineGraph) =>
    evaluatePolicySync({
      delta: computeGraphDelta(baseline, proposed),
      proposedGraph: proposed,
      approvedPartners: approvedRegistry,
      policyVersion: POLICY_VERSION,
    });

  it.each([
    ["actor", { ...baselineGraph, actors: baselineGraph.actors.slice(1) }],
    ["account", { ...baselineGraph, accounts: baselineGraph.accounts.slice(1) }],
    ["money edge", { ...baselineGraph, moneyEdges: baselineGraph.moneyEdges.slice(1) }],
  ])("removing an existing %s returns REVIEW", (_kind, proposed) => {
    const result = evaluate(baselineGraph, proposed);
    expect(result.decision).toBe("REVIEW");
    expect(result.violations).toEqual([
      expect.objectContaining({ policyId: "TOPOLOGY-CHANGE", severity: "REVIEW" }),
    ]);
  });

  it("removing an existing obligation returns REVIEW", () => {
    const proposed = { ...reviewGraph, obligations: [] };
    const result = evaluate(reviewGraph, proposed);
    expect(result.decision).toBe("REVIEW");
    expect(result.violations[0].policyId).toBe("TOPOLOGY-CHANGE");
  });

  it("reviews an otherwise unmatched mechanism change", () => {
    const proposed = {
      ...baselineGraph,
      moneyEdges: baselineGraph.moneyEdges.map((edge, index) =>
        index === 0 ? { ...edge, mechanism: "DIRECT_BANK_TRANSFER" as const } : edge,
      ),
    };
    const result = evaluate(baselineGraph, proposed);
    expect(result.decision).toBe("REVIEW");
    expect(result.violations[0]).toMatchObject({ policyId: "TOPOLOGY-CHANGE" });
  });

  it("mirrors the TypeScript fallback condition in Rego", () => {
    const rego = readFileSync(resolve("src/policy/rego/main.rego"), "utf8");
    expect(rego).toContain("count(specific_violations) == 0");
    expect(rego).toContain("delta_non_empty");
    expect(rego).toContain('"policyId": "TOPOLOGY-CHANGE"');
    expect(rego).toContain('"severity": "REVIEW"');
  });
});

// ---------------------------------------------------------------------------
// CASE 4 — AMBIGUOUS
// ---------------------------------------------------------------------------
describe("CASE 4 — AMBIGUOUS: uncertain AI evidence forces REVIEW", () => {
  const input: PolicyInput = {
    delta: computeGraphDelta(baselineGraph, ambiguousGraph),
    proposedGraph: ambiguousGraph,
    approvedPartners: approvedRegistry,
    policyVersion: POLICY_VERSION,
  };

  it("decision is REVIEW (cannot safely PASS with uncertain evidence)", () => {
    const result = evaluatePolicySync(input);
    expect(result.decision).toBe("REVIEW");
  });

  it("decision is NOT BLOCK (no hard violations)", () => {
    const result = evaluatePolicySync(input);
    expect(result.decision).not.toBe("BLOCK");
  });

  it("UNCERTAIN-EVIDENCE violation present", () => {
    const result = evaluatePolicySync(input);
    expect(result.violations.some((v) => v.policyId === "UNCERTAIN-EVIDENCE")).toBe(true);
  });

  it("does not duplicate uncertain-evidence review with generic topology review", () => {
    const result = evaluatePolicySync(input);
    expect(result.violations.some((v) => v.policyId === "TOPOLOGY-CHANGE")).toBe(false);
  });

  it("proposed graph has hasUnverifiedEvidence=true on some objects", () => {
    const hasUncertain = [
      ...ambiguousGraph.actors,
      ...ambiguousGraph.accounts,
      ...ambiguousGraph.moneyEdges,
    ].some((o) => o.hasUnverifiedEvidence);
    expect(hasUncertain).toBe(true);
  });

  it("AI_INFERRED evidence does not create a legal conclusion (no definitive BLOCK from UNCERTAIN evidence)", () => {
    const result = evaluatePolicySync(input);
    // System must not auto-BLOCK just because there is AI uncertainty
    // It must REVIEW, giving humans the chance to evaluate
    expect(result.decision).toBe("REVIEW");
    expect(result.violations.some((v) => v.severity === "BLOCK")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------
describe("Policy determinism: 100 replays", () => {
  const cases: Array<{ name: string; input: PolicyInput; expectedDecision: string }> = [
    {
      name: "PASS",
      input: {
        delta: computeGraphDelta(baselineGraph, passGraph),
        proposedGraph: passGraph,
        approvedPartners: approvedRegistry,
        policyVersion: POLICY_VERSION,
      },
      expectedDecision: "PASS",
    },
    {
      name: "REVIEW",
      input: {
        delta: computeGraphDelta(baselineGraph, reviewGraph),
        proposedGraph: reviewGraph,
        approvedPartners: approvedRegistry,
        policyVersion: POLICY_VERSION,
      },
      expectedDecision: "REVIEW",
    },
    {
      name: "BLOCK",
      input: {
        delta: computeGraphDelta(baselineGraph, blockGraph),
        proposedGraph: blockGraph,
        approvedPartners: approvedRegistry,
        policyVersion: POLICY_VERSION,
      },
      expectedDecision: "BLOCK",
    },
  ];

  for (const { name, input, expectedDecision } of cases) {
    it(`CASE ${name}: 100 replays → always ${expectedDecision}`, () => {
      for (let i = 0; i < 100; i++) {
        const result = evaluatePolicySync(input);
        expect(result.decision).toBe(expectedDecision);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Decision enum contract
// ---------------------------------------------------------------------------
describe("Decision enum contract", () => {
  it("decision is always one of: PASS | REVIEW | BLOCK", () => {
    const inputs: PolicyInput[] = [
      { delta: computeGraphDelta(baselineGraph, passGraph), proposedGraph: passGraph, approvedPartners: approvedRegistry, policyVersion: POLICY_VERSION },
      { delta: computeGraphDelta(baselineGraph, reviewGraph), proposedGraph: reviewGraph, approvedPartners: approvedRegistry, policyVersion: POLICY_VERSION },
      { delta: computeGraphDelta(baselineGraph, blockGraph), proposedGraph: blockGraph, approvedPartners: approvedRegistry, policyVersion: POLICY_VERSION },
      { delta: computeGraphDelta(baselineGraph, ambiguousGraph), proposedGraph: ambiguousGraph, approvedPartners: approvedRegistry, policyVersion: POLICY_VERSION },
    ];

    const valid = new Set(["PASS", "REVIEW", "BLOCK"]);
    for (const input of inputs) {
      const result = evaluatePolicySync(input);
      expect(valid.has(result.decision)).toBe(true);
    }
  });

  it("REVIEW_REQUIRED never appears as a decision value", () => {
    const inputs: PolicyInput[] = [
      { delta: computeGraphDelta(baselineGraph, reviewGraph), proposedGraph: reviewGraph, approvedPartners: approvedRegistry, policyVersion: POLICY_VERSION },
    ];
    for (const input of inputs) {
      const result = evaluatePolicySync(input);
      expect(result.decision).not.toBe("REVIEW_REQUIRED");
    }
  });
});
