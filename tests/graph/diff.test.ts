/**
 * Phase 1 tests: Graph diff
 *
 * Tests:
 * - CASE 1 (PASS): empty ΔG
 * - CASE 2 (REVIEW): addedActors, addedAccounts, addedMoneyEdges, addedObligations
 * - CASE 3 (BLOCK): removedAccounts, addedAccounts, removedMoneyEdges, addedMoneyEdges
 * - Identity rules: renaming label → no delta; evidence location change → no delta
 * - MoneyEdge identity = (src, dst): mechanism change → changedMoneyEdges
 * - Obligation identity = (debtor, creditor): financingFeeBps change → changedObligations
 * - isDeltaEmpty helper
 */

import { describe, it, expect } from "vitest";
import { computeGraphDelta, isDeltaEmpty } from "../../src/graph/diff.js";
import { baselineGraph } from "../../fixtures/baseline.js";
import { passGraph } from "../../fixtures/case-pass.js";
import { reviewGraph } from "../../fixtures/case-review.js";
import { blockGraph } from "../../fixtures/case-block.js";

describe("CASE 1 — PASS: empty delta", () => {
  it("ΔG is empty when topology is unchanged", () => {
    const delta = computeGraphDelta(baselineGraph, passGraph);
    expect(isDeltaEmpty(delta)).toBe(true);
  });

  it("all delta collections are empty arrays", () => {
    const delta = computeGraphDelta(baselineGraph, passGraph);
    expect(delta.addedActors).toHaveLength(0);
    expect(delta.removedActors).toHaveLength(0);
    expect(delta.addedAccounts).toHaveLength(0);
    expect(delta.removedAccounts).toHaveLength(0);
    expect(delta.addedMoneyEdges).toHaveLength(0);
    expect(delta.removedMoneyEdges).toHaveLength(0);
    expect(delta.changedMoneyEdges).toHaveLength(0);
    expect(delta.addedObligations).toHaveLength(0);
    expect(delta.removedObligations).toHaveLength(0);
    expect(delta.changedObligations).toHaveLength(0);
  });
});

describe("CASE 2 — REVIEW: new actor, account, edge, obligation", () => {
  it("ΔG is NOT empty", () => {
    const delta = computeGraphDelta(baselineGraph, reviewGraph);
    expect(isDeltaEmpty(delta)).toBe(false);
  });

  it("detects Partner X as added actor", () => {
    const delta = computeGraphDelta(baselineGraph, reviewGraph);
    expect(delta.addedActors).toHaveLength(1);
    expect(delta.addedActors[0].id).toBe("actor:partner_x");
    expect(delta.addedActors[0].type).toBe("FINANCING_PROVIDER");
  });

  it("detects loan pool account as added", () => {
    const delta = computeGraphDelta(baselineGraph, reviewGraph);
    expect(delta.addedAccounts).toHaveLength(1);
    expect(delta.addedAccounts[0].id).toBe("acc:partner_x:loan_pool");
    expect(delta.addedAccounts[0].custody).toBe("RE");
  });

  it("detects new EXTERNAL_API_ROUTING edge", () => {
    const delta = computeGraphDelta(baselineGraph, reviewGraph);
    expect(delta.addedMoneyEdges).toHaveLength(1);
    expect(delta.addedMoneyEdges[0].mechanism).toBe("EXTERNAL_API_ROUTING");
  });

  it("detects new installment obligation", () => {
    const delta = computeGraphDelta(baselineGraph, reviewGraph);
    expect(delta.addedObligations).toHaveLength(1);
    const o = delta.addedObligations[0];
    expect(o.debtorActorId).toBe("actor:customer");
    expect(o.creditorActorId).toBe("actor:partner_x");
    expect(o.tenorDays).toBe(90);
    expect(o.installments).toBe(3);
    expect(o.financingFeeBps).toBe(150);
  });

  it("no actors removed in REVIEW case", () => {
    const delta = computeGraphDelta(baselineGraph, reviewGraph);
    expect(delta.removedActors).toHaveLength(0);
  });
});

describe("CASE 3 — BLOCK: loan disbursal through a third-party pool", () => {
  it("ΔG is NOT empty", () => {
    const delta = computeGraphDelta(baselineGraph, blockGraph);
    expect(isDeltaEmpty(delta)).toBe(false);
  });

  it("detects lending and treasury actors as added", () => {
    const delta = computeGraphDelta(baselineGraph, blockGraph);
    expect(delta.addedActors).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "actor:partner_x", type: "FINANCING_PROVIDER" }),
      expect.objectContaining({ id: "actor:treasury", type: "THIRD_PARTY" }),
    ]));
  });

  it("detects treasury pool account as added", () => {
    const delta = computeGraphDelta(baselineGraph, blockGraph);
    const addedIds = delta.addedAccounts.map((a) => a.id);
    expect(addedIds).toContain("acc:treasury:pool");
  });

  it("detects POOL_PASS_THROUGH edge as added", () => {
    const delta = computeGraphDelta(baselineGraph, blockGraph);
    const poolEdge = delta.addedMoneyEdges.find(
      (e) => e.mechanism === "POOL_PASS_THROUGH",
    );
    expect(poolEdge).toBeDefined();
  });

  it("detects the lending obligation as added", () => {
    const delta = computeGraphDelta(baselineGraph, blockGraph);
    expect(delta.addedObligations).toEqual(expect.arrayContaining([
      expect.objectContaining({ debtorActorId: "actor:borrower", creditorActorId: "actor:partner_x" }),
    ]));
  });
});

describe("Identity rules", () => {
  it("variable rename (label change) = no topology delta", () => {
    const modified = {
      ...baselineGraph,
      actors: baselineGraph.actors.map((a) =>
        a.id === "actor:customer"
          ? { ...a, label: "Renamed Label (non-financial)" }
          : a,
      ),
    };
    const delta = computeGraphDelta(baselineGraph, modified);
    expect(isDeltaEmpty(delta)).toBe(true);
  });

  it("evidence location change = no topology delta", () => {
    const modified = {
      ...baselineGraph,
      actors: baselineGraph.actors.map((a) => ({
        ...a,
        evidenceIds: ["completely-different-evidence-id"],
      })),
    };
    const delta = computeGraphDelta(baselineGraph, modified);
    expect(isDeltaEmpty(delta)).toBe(true);
  });

  it("trust-state change alone = no topology delta", () => {
    const modified = {
      ...baselineGraph,
      moneyEdges: baselineGraph.moneyEdges.map((e) => ({
        ...e,
        derivation: "AI_INFERRED" as const,
        hasUnverifiedEvidence: true,
      })),
    };
    const delta = computeGraphDelta(baselineGraph, modified);
    // Trust metadata changes → no topology delta (identity unchanged)
    expect(isDeltaEmpty(delta)).toBe(true);
  });

  it("MoneyEdge mechanism change = changedMoneyEdges (same endpoints)", () => {
    const modified = {
      ...baselineGraph,
      moneyEdges: baselineGraph.moneyEdges.map((e) =>
        e.id === "edge:escrow-to-merchant"
          ? { ...e, mechanism: "POOL_PASS_THROUGH" as const }
          : e,
      ),
    };
    const delta = computeGraphDelta(baselineGraph, modified);
    expect(delta.changedMoneyEdges).toHaveLength(1);
    expect(delta.changedMoneyEdges[0].before.mechanism).toBe("DIRECT_BANK_TRANSFER");
    expect(delta.changedMoneyEdges[0].after.mechanism).toBe("POOL_PASS_THROUGH");
  });

  it("MoneyEdge settlementDelayDays change = changedMoneyEdges (same endpoints)", () => {
    const modified = {
      ...baselineGraph,
      moneyEdges: baselineGraph.moneyEdges.map((e) =>
        e.id === "edge:escrow-to-merchant"
          ? { ...e, settlementDelayDays: 5 }
          : e,
      ),
    };
    const delta = computeGraphDelta(baselineGraph, modified);
    expect(delta.changedMoneyEdges).toHaveLength(1);
    expect(delta.changedMoneyEdges[0].before.settlementDelayDays).toBe(1);
    expect(delta.changedMoneyEdges[0].after.settlementDelayDays).toBe(5);
  });

  it("completely different endpoints = remove + add, not change", () => {
    // Construct a graph where the escrow→merchant edge now goes escrow→unknown
    const modified = {
      ...baselineGraph,
      actors: [
        ...baselineGraph.actors,
        {
          id: "actor:new_dest",
          label: "New Destination",
          type: "UNKNOWN" as const,
          derivation: "DETERMINISTIC" as const,
          hasUnverifiedEvidence: false,
          evidenceIds: [],
        },
      ],
      accounts: [
        ...baselineGraph.accounts,
        {
          id: "acc:new:dest",
          label: "New Dest Account",
          ownerActorId: "actor:new_dest",
          custody: "UNKNOWN" as const,
          derivation: "DETERMINISTIC" as const,
          hasUnverifiedEvidence: false,
          evidenceIds: [],
        },
      ],
      moneyEdges: [
        // Keep cust→escrow but remove escrow→merchant, add escrow→new_dest
        baselineGraph.moneyEdges.find((e) => e.id === "edge:cust-to-escrow")!,
        {
          id: "edge:escrow-to-new",
          label: "New destination",
          sourceAccountId: "acc:razorpay:escrow",
          destinationAccountId: "acc:new:dest",
          mechanism: "DIRECT_BANK_TRANSFER" as const,
          derivation: "DETERMINISTIC" as const,
          hasUnverifiedEvidence: false,
          evidenceIds: [],
        },
      ],
    };
    const delta = computeGraphDelta(baselineGraph, modified);
    // escrow→merchant removed; escrow→new_dest added
    expect(delta.removedMoneyEdges).toHaveLength(1);
    expect(delta.removedMoneyEdges[0].destinationAccountId).toBe("acc:merchant:bank");
    expect(delta.addedMoneyEdges).toHaveLength(1);
    expect(delta.addedMoneyEdges[0].destinationAccountId).toBe("acc:new:dest");
    expect(delta.changedMoneyEdges).toHaveLength(0);
  });
});

describe("isDeltaEmpty helper", () => {
  it("returns true for a delta with all empty arrays", () => {
    expect(
      isDeltaEmpty({
        addedActors: [],
        removedActors: [],
        addedAccounts: [],
        removedAccounts: [],
        addedMoneyEdges: [],
        removedMoneyEdges: [],
        changedMoneyEdges: [],
        addedObligations: [],
        removedObligations: [],
        changedObligations: [],
      }),
    ).toBe(true);
  });

  it("returns false if any collection is non-empty", () => {
    const delta = computeGraphDelta(baselineGraph, reviewGraph);
    expect(isDeltaEmpty(delta)).toBe(false);
  });
});
