/**
 * Phase 2 tests: DL-02 policy
 *
 * DL-02: Approved partner structural check
 * Source: RBI (Digital Lending) Directions, 2025, Para 17 (strong confidence — see
 *   policy-sources/dl-02.json). This is a mechanism change from the superseded
 *   September 2022 Guidelines' Para 8 "board-approved list" — the 2025 Directions
 *   instead require CIMS-portal reporting with CCO-certified accuracy. This check
 *   enforces the internal-record precondition for correct CIMS certification.
 *
 * Tests:
 * - PASS: FINANCING_PROVIDER actor IS in approved registry
 * - BLOCK: FINANCING_PROVIDER actor NOT in approved registry
 * - PASS: non-FINANCING_PROVIDER actors not checked
 * - Full graph check: actor present pre-PR (not in delta) but unapproved → still blocked
 */

import { describe, it, expect } from "vitest";
import { evaluateDL02 } from "../../src/policy/evaluator.js";
import { baselineGraph } from "../../fixtures/baseline.js";
import { reviewGraph } from "../../fixtures/case-review.js";
import { blockGraph } from "../../fixtures/case-block.js";
import type { ApprovedPartnerRegistry } from "../../src/policy/types.js";
import type { ActivityGraph } from "../../src/graph/types.js";

// Registry with Partner X approved
const registryWithPartnerX: ApprovedPartnerRegistry = {
  version: "1.0.0",
  updatedAt: "2026-01-15T00:00:00Z",
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

// Empty registry (no partners approved)
const emptyRegistry: ApprovedPartnerRegistry = {
  version: "1.0.0",
  updatedAt: "2026-01-15T00:00:00Z",
  partners: [],
};

// Registry with a different partner approved
const registryWithWrongPartner: ApprovedPartnerRegistry = {
  version: "1.0.0",
  updatedAt: "2026-01-15T00:00:00Z",
  partners: [
    {
      actorId: "actor:partner_y",
      name: "Partner Y (different NBFC)",
      roles: ["LENDING_SERVICE_PROVIDER"],
      approvedAt: "2026-01-15T00:00:00Z",
      approvedBy: "compliance-team@razorpay.com",
    },
  ],
};

describe("DL-02 — PASS: approved FINANCING_PROVIDER", () => {
  it("Partner X in registry: no DL-02 violations", () => {
    const violations = evaluateDL02(reviewGraph, registryWithPartnerX);
    expect(violations).toHaveLength(0);
  });

  it("baseline graph (no FINANCING_PROVIDER): no violations", () => {
    const violations = evaluateDL02(baselineGraph, emptyRegistry);
    expect(violations).toHaveLength(0);
  });

  it("block graph (THIRD_PARTY actor, not FINANCING_PROVIDER): no DL-02 violations", () => {
    // blockGraph has actor:treasury (THIRD_PARTY) — DL-02 only checks FINANCING_PROVIDER
    const violations = evaluateDL02(blockGraph, emptyRegistry);
    expect(violations).toHaveLength(0);
  });
});

describe("DL-02 — BLOCK: unapproved FINANCING_PROVIDER", () => {
  it("Partner X NOT in registry: DL-02 violation", () => {
    const violations = evaluateDL02(reviewGraph, emptyRegistry);
    expect(violations).toHaveLength(1);
  });

  it("violation policyId is DL-02", () => {
    const violations = evaluateDL02(reviewGraph, emptyRegistry);
    expect(violations[0].policyId).toBe("DL-02");
  });

  it("violation severity is BLOCK", () => {
    const violations = evaluateDL02(reviewGraph, emptyRegistry);
    expect(violations[0].severity).toBe("BLOCK");
  });

  it("violation references actor:partner_x", () => {
    const violations = evaluateDL02(reviewGraph, emptyRegistry);
    const obj = violations[0].graphObjects.find((o) => o.id === "actor:partner_x");
    expect(obj).toBeDefined();
  });

  it("wrong partner in registry still blocks Partner X", () => {
    const violations = evaluateDL02(reviewGraph, registryWithWrongPartner);
    expect(violations).toHaveLength(1);
    expect(violations[0].graphObjects[0].id).toBe("actor:partner_x");
  });

  it("violation message cites the current RBI (Digital Lending) Directions, 2025, Para 17 (CIMS reporting)", () => {
    const violations = evaluateDL02(reviewGraph, emptyRegistry);
    expect(violations[0].message).toContain("Digital Lending) Directions, 2025");
    expect(violations[0].message).toContain("Para 17");
  });

  it("violation message mentions approved-partners.json", () => {
    const violations = evaluateDL02(reviewGraph, emptyRegistry);
    expect(violations[0].message).toContain("approved-partners.json");
  });
});

describe("DL-02 — full graph check (not just delta)", () => {
  it("FINANCING_PROVIDER pre-existing in graph (not in delta) but unapproved → still blocks", () => {
    // Simulate: Partner X was present in baseline (already in graph) but not in registry
    // The delta would show 0 addedActors for partner_x (it pre-existed)
    // But DL-02 checks the FULL proposedGraph — should still block
    const preexistingPartnerGraph: ActivityGraph = {
      ...baselineGraph,
      // Add partner_x to baseline graph (simulating pre-existing actor)
      actors: [
        ...baselineGraph.actors,
        {
          id: "actor:partner_x",
          label: "Partner X (pre-existing in graph)",
          type: "FINANCING_PROVIDER" as const,
          derivation: "DETERMINISTIC" as const,
          hasUnverifiedEvidence: false,
          evidenceIds: ["ev:pre-existing:001"],
        },
      ],
    };

    // This is the proposed graph — partner_x is in it, even if delta shows no change
    const violations = evaluateDL02(preexistingPartnerGraph, emptyRegistry);
    expect(violations).toHaveLength(1);
    expect(violations[0].policyId).toBe("DL-02");
    expect(violations[0].severity).toBe("BLOCK");
  });
});

describe("DL-02 — non-FINANCING_PROVIDER actors not checked", () => {
  it("CUSTOMER actor not in registry: no DL-02 violation", () => {
    const violations = evaluateDL02(baselineGraph, emptyRegistry);
    // baselineGraph has CUSTOMER, PAYMENT_PROVIDER, MERCHANT — none trigger DL-02
    expect(violations).toHaveLength(0);
  });

  it("PAYMENT_PROVIDER actor not in registry: no DL-02 violation", () => {
    const violations = evaluateDL02(baselineGraph, emptyRegistry);
    expect(violations).toHaveLength(0);
  });

  it("THIRD_PARTY actor not in registry: no DL-02 violation", () => {
    const violations = evaluateDL02(blockGraph, emptyRegistry);
    // blockGraph has actor:treasury (THIRD_PARTY) — not checked by DL-02
    expect(violations).toHaveLength(0);
  });
});
