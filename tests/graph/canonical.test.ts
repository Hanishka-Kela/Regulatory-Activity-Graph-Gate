/**
 * Phase 1 tests: Graph types and canonicalization
 *
 * Tests:
 * - Category A fields change → hash changes
 * - Category B fields change (label, evidenceIds) → hash stays the same
 * - Category C fields change (derivation, hasUnverifiedEvidence) → hash stays the same
 * - Corrected schema: custody enum values match section 13
 * - Corrected schema: mechanism enum values match section 14
 * - settlementDelayDays is flattened (not nested)
 */

import { describe, it, expect } from "vitest";
import {
  hashGraph,
  serializeCanonicalGraph,
  verifyGraphHash,
} from "../../src/graph/canonical.js";
import { ActivityGraphBuilder } from "../../src/graph/builder.js";
import { baselineGraph } from "../../fixtures/baseline.js";
import { reviewGraph } from "../../fixtures/case-review.js";

describe("canonical hash — Category A changes alter the hash", () => {
  it("baseline hash is stable across calls", () => {
    expect(hashGraph(baselineGraph)).toBe(baselineGraph.hash);
  });

  it("verifyGraphHash returns true for baseline", () => {
    expect(verifyGraphHash(baselineGraph)).toBe(true);
  });

  it("changing an actor type changes the hash", () => {
    const modified = {
      ...baselineGraph,
      actors: baselineGraph.actors.map((a) =>
        a.id === "actor:customer"
          ? { ...a, type: "MERCHANT" as const }
          : a,
      ),
    };
    expect(hashGraph(modified)).not.toBe(baselineGraph.hash);
  });

  it("changing account custody changes the hash", () => {
    const modified = {
      ...baselineGraph,
      accounts: baselineGraph.accounts.map((a) =>
        a.id === "acc:razorpay:escrow"
          ? { ...a, custody: "THIRD_PARTY" as const }
          : a,
      ),
    };
    expect(hashGraph(modified)).not.toBe(baselineGraph.hash);
  });

  it("changing moneyEdge mechanism changes the hash", () => {
    const modified = {
      ...baselineGraph,
      moneyEdges: baselineGraph.moneyEdges.map((e) =>
        e.id === "edge:cust-to-escrow"
          ? { ...e, mechanism: "POOL_PASS_THROUGH" as const }
          : e,
      ),
    };
    expect(hashGraph(modified)).not.toBe(baselineGraph.hash);
  });

  it("changing settlementDelayDays changes the hash", () => {
    const modified = {
      ...baselineGraph,
      moneyEdges: baselineGraph.moneyEdges.map((e) =>
        e.id === "edge:escrow-to-merchant"
          ? { ...e, settlementDelayDays: 3 }
          : e,
      ),
    };
    expect(hashGraph(modified)).not.toBe(baselineGraph.hash);
  });
});

describe("canonical hash — Category B/C changes do NOT alter the hash", () => {
  it("changing a label does NOT change the hash", () => {
    const modified = {
      ...baselineGraph,
      actors: baselineGraph.actors.map((a) =>
        a.id === "actor:customer"
          ? { ...a, label: "Renamed Customer Label" }
          : a,
      ),
    };
    expect(hashGraph(modified)).toBe(baselineGraph.hash);
  });

  it("changing evidenceIds does NOT change the hash", () => {
    const modified = {
      ...baselineGraph,
      actors: baselineGraph.actors.map((a) =>
        a.id === "actor:customer"
          ? { ...a, evidenceIds: ["new-evidence-id-xyz"] }
          : a,
      ),
    };
    expect(hashGraph(modified)).toBe(baselineGraph.hash);
  });

  it("changing derivation does NOT change the hash", () => {
    const modified = {
      ...baselineGraph,
      actors: baselineGraph.actors.map((a) =>
        a.id === "actor:customer"
          ? { ...a, derivation: "AI_INFERRED" as const }
          : a,
      ),
    };
    expect(hashGraph(modified)).toBe(baselineGraph.hash);
  });

  it("changing hasUnverifiedEvidence does NOT change the hash", () => {
    const modified = {
      ...baselineGraph,
      actors: baselineGraph.actors.map((a) =>
        a.id === "actor:customer"
          ? { ...a, hasUnverifiedEvidence: true }
          : a,
      ),
    };
    expect(hashGraph(modified)).toBe(baselineGraph.hash);
  });

  it("changing metadata.commitSha does NOT change the hash", () => {
    const modified = {
      ...baselineGraph,
      metadata: { ...baselineGraph.metadata, commitSha: "different-commit-sha" },
    };
    expect(hashGraph(modified)).toBe(baselineGraph.hash);
  });

  it("changing money-edge and obligation display IDs does NOT change the hash", () => {
    const modified = {
      ...baselineGraph,
      moneyEdges: baselineGraph.moneyEdges.map((edge) => ({ ...edge, id: `display:${edge.id}` })),
    };
    expect(hashGraph(modified)).toBe(baselineGraph.hash);
    expect(hashGraph({ ...reviewGraph, obligations: reviewGraph.obligations.map((obligation) => ({ ...obligation, id: `display:${obligation.id}` })) })).toBe(reviewGraph.hash);
  });
});

describe("canonical schema validation", () => {
  it("custody enum contains corrected section-13 values", () => {
    const custodyValues = baselineGraph.accounts.map((a) => a.custody);
    // Verify section 13 values are accepted (ESCROW_BANK is one of the corrected values)
    expect(custodyValues).toContain("ESCROW_BANK");
    expect(custodyValues).toContain("CUSTOMER");
    expect(custodyValues).toContain("MERCHANT");
  });

  it("mechanism enum contains corrected section-14 values", () => {
    const mechanisms = baselineGraph.moneyEdges.map((e) => e.mechanism);
    expect(mechanisms).toContain("ESCROW");
    expect(mechanisms).toContain("DIRECT_BANK_TRANSFER");
  });

  it("settlementDelayDays is a top-level field (not nested)", () => {
    const edge = baselineGraph.moneyEdges.find(
      (e) => e.id === "edge:escrow-to-merchant",
    )!;
    // Flattened — should exist directly on the edge object
    expect(edge.settlementDelayDays).toBe(1);
    // timing.delayDays must NOT exist
    expect((edge as unknown as Record<string, unknown>)["timing"]).toBeUndefined();
  });

  it("builder rejects old custody enum value PROVIDER", () => {
    const builder = new ActivityGraphBuilder();
    builder.addActor({
      id: "actor:test",
      label: "Test",
      type: "PAYMENT_PROVIDER",
      derivation: "DETERMINISTIC",
      hasUnverifiedEvidence: false,
      evidenceIds: [],
    });
    expect(() =>
      builder.addAccount({
        id: "acc:test",
        label: "Test Account",
        ownerActorId: "actor:test",
        // @ts-expect-error — deliberately testing runtime rejection of old value
        custody: "PROVIDER",
        derivation: "DETERMINISTIC",
        hasUnverifiedEvidence: false,
        evidenceIds: [],
      }),
    ).toThrow();
  });

  it("builder rejects old mechanism enum value DIRECT_TRANSFER", () => {
    const builder = new ActivityGraphBuilder();
    builder.addActor({
      id: "actor:src",
      label: "Src",
      type: "CUSTOMER",
      derivation: "DETERMINISTIC",
      hasUnverifiedEvidence: false,
      evidenceIds: [],
    });
    builder.addActor({
      id: "actor:dst",
      label: "Dst",
      type: "MERCHANT",
      derivation: "DETERMINISTIC",
      hasUnverifiedEvidence: false,
      evidenceIds: [],
    });
    builder.addAccount({
      id: "acc:src",
      label: "Src Acc",
      ownerActorId: "actor:src",
      custody: "CUSTOMER",
      derivation: "DETERMINISTIC",
      hasUnverifiedEvidence: false,
      evidenceIds: [],
    });
    builder.addAccount({
      id: "acc:dst",
      label: "Dst Acc",
      ownerActorId: "actor:dst",
      custody: "MERCHANT",
      derivation: "DETERMINISTIC",
      hasUnverifiedEvidence: false,
      evidenceIds: [],
    });
    expect(() =>
      builder.addMoneyEdge({
        id: "edge:test",
        label: "Test Edge",
        sourceAccountId: "acc:src",
        destinationAccountId: "acc:dst",
        // @ts-expect-error — deliberately testing runtime rejection of old value
        mechanism: "DIRECT_TRANSFER",
        derivation: "DETERMINISTIC",
        hasUnverifiedEvidence: false,
        evidenceIds: [],
      }),
    ).toThrow();
  });
});

describe("canonical serialization stability", () => {
  it("serializeCanonicalGraph is deterministic", () => {
    const s1 = serializeCanonicalGraph(baselineGraph);
    const s2 = serializeCanonicalGraph(baselineGraph);
    expect(s1).toBe(s2);
  });

  it("serialization order is stable regardless of insertion order", () => {
    // Build two graphs with actors inserted in different order
    function buildWithOrder(customerFirst: boolean) {
      const b = new ActivityGraphBuilder();
      const customer = {
        id: "actor:customer",
        label: "Customer",
        type: "CUSTOMER" as const,
        derivation: "DETERMINISTIC" as const,
        hasUnverifiedEvidence: false,
        evidenceIds: [],
      };
      const merchant = {
        id: "actor:merchant",
        label: "Merchant",
        type: "MERCHANT" as const,
        derivation: "DETERMINISTIC" as const,
        hasUnverifiedEvidence: false,
        evidenceIds: [],
      };
      if (customerFirst) {
        b.addActor(customer).addActor(merchant);
      } else {
        b.addActor(merchant).addActor(customer);
      }
      return b.build("sha-test");
    }

    const g1 = buildWithOrder(true);
    const g2 = buildWithOrder(false);
    expect(hashGraph(g1)).toBe(hashGraph(g2));
  });
});
