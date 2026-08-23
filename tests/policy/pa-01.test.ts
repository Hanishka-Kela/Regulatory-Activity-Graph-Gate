/**
 * Phase 2 tests: PA-01 policy
 *
 * PA-01: Payment Aggregator escrow topology check
 * Source: RBI PA Master Direction 2025 (RBI/DPSS/2025-26/141)
 * Demo scope: PA-Online (domestic INR)
 *
 * Tests:
 * - PASS: proper escrow topology (PA→ESCROW_BANK→MERCHANT)
 * - REVIEW: direct routing without escrow
 * - BLOCK graph (pool): PA-01 also fires because pool→merchant bypasses ESCROW_BANK
 * - REVIEW graph: no PA-01 violation (EXTERNAL_API_ROUTING to RE account, not merchant directly from non-escrow)
 */

import { describe, it, expect } from "vitest";
import { evaluatePA01 } from "../../src/policy/evaluator.js";
import { baselineGraph } from "../../fixtures/baseline.js";
import { blockGraph } from "../../fixtures/case-block.js";
import { reviewGraph } from "../../fixtures/case-review.js";
import { passGraph } from "../../fixtures/case-pass.js";
import type { ActivityGraph, Account, MoneyEdge } from "../../src/graph/types.js";

describe("PA-01 — PASS cases", () => {
  it("baseline (ESCROW_BANK→MERCHANT): no violations", () => {
    // escrow account (ESCROW_BANK custody) feeds the merchant
    const violations = evaluatePA01(baselineGraph);
    expect(violations).toHaveLength(0);
  });

  it("PASS graph (identical to baseline): no violations", () => {
    const violations = evaluatePA01(passGraph);
    expect(violations).toHaveLength(0);
  });
});

describe("PA-01 — REVIEW cases", () => {
  it("REVIEW graph: new EXTERNAL_API_ROUTING edge to RE account (not merchant directly from non-escrow)", () => {
    // In reviewGraph, the new edge goes to acc:partner_x:loan_pool (custody: RE), not merchant
    // The existing merchant edge still goes from ESCROW_BANK → merchant ✓
    const violations = evaluatePA01(reviewGraph);
    expect(violations).toHaveLength(0);
  });

  it("direct non-escrow source → merchant: PA-01 violation", () => {
    // Remove the escrow account and put a direct RE→merchant edge
    const directGraph: ActivityGraph = {
      ...baselineGraph,
      accounts: baselineGraph.accounts.map((a) =>
        a.id === "acc:razorpay:escrow"
          ? { ...a, custody: "RE" as const } // no longer ESCROW_BANK
          : a,
      ),
    };
    const violations = evaluatePA01(directGraph);
    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(violations[0].policyId).toBe("PA-01");
    expect(violations[0].severity).toBe("REVIEW");
  });

  it("violation message mentions RBI PA Master Direction 2025", () => {
    const directGraph: ActivityGraph = {
      ...baselineGraph,
      accounts: baselineGraph.accounts.map((a) =>
        a.id === "acc:razorpay:escrow"
          ? { ...a, custody: "RE" as const }
          : a,
      ),
    };
    const violations = evaluatePA01(directGraph);
    expect(violations[0].message).toContain("RBI PA Master Direction 2025");
  });
});

describe("PA-01 — BLOCK graph (pool pass-through case)", () => {
  it("pool→merchant edge also triggers PA-01 (pool is THIRD_PARTY, not ESCROW_BANK)", () => {
    // blockGraph: acc:treasury:pool (THIRD_PARTY) → acc:merchant:bank (MERCHANT)
    // No ESCROW_BANK in the graph → PA-01 fires
    const violations = evaluatePA01(blockGraph);
    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(violations.some((v) => v.policyId === "PA-01")).toBe(true);
  });
});

describe("PA-01 — no false positives for non-merchant destinations", () => {
  it("edge to RE account: no PA-01 violation", () => {
    // reviewGraph: new edge goes to acc:partner_x:loan_pool (custody: RE)
    // Only merchant-destined edges from non-escrow sources trigger PA-01
    const reOnlyGraph: ActivityGraph = {
      ...baselineGraph,
      // Replace the merchant account with an RE account
      accounts: baselineGraph.accounts.map((a) =>
        a.id === "acc:merchant:bank"
          ? { ...a, custody: "RE" as const }
          : a,
      ),
    };
    const violations = evaluatePA01(reOnlyGraph);
    // No MERCHANT-custody account → no PA-01 violations
    expect(violations).toHaveLength(0);
  });
});
