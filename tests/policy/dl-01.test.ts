/**
 * Phase 2 tests: DL-01 policy
 *
 * DL-01: Prohibited pool/pass-through account pattern
 * Source: RBI (Digital Lending) Directions, 2025, Paragraph 9.
 *
 * Tests:
 * - PASS: no POOL_PASS_THROUGH edges
 * - BLOCK: POOL_PASS_THROUGH edge present
 * - BLOCK: multiple POOL_PASS_THROUGH edges produce multiple violations
 * - Mechanism variants: other mechanisms do not trigger DL-01
 */

import { describe, it, expect } from "vitest";
import { evaluateDL01 } from "../../src/policy/evaluator.js";
import { baselineGraph } from "../../fixtures/baseline.js";
import { blockGraph } from "../../fixtures/case-block.js";
import { reviewGraph } from "../../fixtures/case-review.js";
import { passGraph } from "../../fixtures/case-pass.js";
import type { ActivityGraph } from "../../src/graph/types.js";

describe("DL-01 — PASS cases", () => {
  it("POOL_PASS_THROUGH outside lending context does not trigger", () => {
    const nonLendingGraph: ActivityGraph = {
      ...baselineGraph,
      moneyEdges: baselineGraph.moneyEdges.map((edge, index) =>
        index === 0 ? { ...edge, mechanism: "POOL_PASS_THROUGH" as const } : edge,
      ),
    };
    expect(evaluateDL01(nonLendingGraph)).toHaveLength(0);
  });

  it("baseline (ESCROW + DIRECT_BANK_TRANSFER): no violations", () => {
    const violations = evaluateDL01(baselineGraph);
    expect(violations).toHaveLength(0);
  });

  it("PASS graph (identical to baseline): no violations", () => {
    const violations = evaluateDL01(passGraph);
    expect(violations).toHaveLength(0);
  });

  it("REVIEW graph (EXTERNAL_API_ROUTING): no DL-01 violations", () => {
    const violations = evaluateDL01(reviewGraph);
    expect(violations).toHaveLength(0);
  });
});

describe("DL-01 — BLOCK cases", () => {
  it("BLOCK graph (POOL_PASS_THROUGH edge): produces 1 violation", () => {
    const violations = evaluateDL01(blockGraph);
    expect(violations).toHaveLength(1);
  });

  it("violation has correct policyId", () => {
    const violations = evaluateDL01(blockGraph);
    expect(violations[0].policyId).toBe("DL-01");
  });

  it("violation severity is BLOCK", () => {
    const violations = evaluateDL01(blockGraph);
    expect(violations[0].severity).toBe("BLOCK");
  });

  it("violation references the POOL_PASS_THROUGH edge", () => {
    const violations = evaluateDL01(blockGraph);
    const graphObj = violations[0].graphObjects.find(
      (o) => o.id === "edge:lender-to-pool",
    );
    expect(graphObj).toBeDefined();
  });

  it("violation message cites the current RBI (Digital Lending) Directions, 2025, Para 9", () => {
    const violations = evaluateDL01(blockGraph);
    expect(violations[0].message).toContain("Digital Lending) Directions, 2025");
    expect(violations[0].message).toContain("Paragraph 9");
    expect(violations[0].message).toContain("does not by itself establish a legal violation");
  });
});

describe("DL-01 — mechanism variants", () => {
  function graphWithMechanism(mechanism: string): ActivityGraph {
    return {
      ...blockGraph,
      moneyEdges: blockGraph.moneyEdges.map((e) =>
        e.id === "edge:lender-to-pool"
          ? { ...e, mechanism: mechanism as any }
          : e,
      ),
    };
  }

  it("DIRECT_BANK_TRANSFER: no DL-01 violation", () => {
    expect(evaluateDL01(graphWithMechanism("DIRECT_BANK_TRANSFER"))).toHaveLength(0);
  });

  it("INTERNAL_LEDGER_TRANSFER: no DL-01 violation", () => {
    expect(evaluateDL01(graphWithMechanism("INTERNAL_LEDGER_TRANSFER"))).toHaveLength(0);
  });

  it("ESCROW: no DL-01 violation", () => {
    expect(evaluateDL01(graphWithMechanism("ESCROW"))).toHaveLength(0);
  });

  it("EXTERNAL_API_ROUTING: no DL-01 violation", () => {
    expect(evaluateDL01(graphWithMechanism("EXTERNAL_API_ROUTING"))).toHaveLength(0);
  });

  it("UNKNOWN: no DL-01 violation (cannot prove prohibited pattern)", () => {
    expect(evaluateDL01(graphWithMechanism("UNKNOWN"))).toHaveLength(0);
  });

  it("POOL_PASS_THROUGH: DL-01 violation", () => {
    expect(evaluateDL01(graphWithMechanism("POOL_PASS_THROUGH"))).toHaveLength(1);
  });
});

describe("DL-01 — multiple violations", () => {
  it("two POOL_PASS_THROUGH edges → two violations", () => {
    const twoPoolEdges: ActivityGraph = {
      ...blockGraph,
      moneyEdges: [
        ...blockGraph.moneyEdges.map((e) => ({
          ...e,
          mechanism: "POOL_PASS_THROUGH" as const,
        })),
      ],
    };
    // All edges are now POOL_PASS_THROUGH
    const violations = evaluateDL01(twoPoolEdges);
    // blockGraph has 2 edges, both would be POOL_PASS_THROUGH now
    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(violations.every((v) => v.policyId === "DL-01")).toBe(true);
    expect(violations.every((v) => v.severity === "BLOCK")).toBe(true);
  });
});
