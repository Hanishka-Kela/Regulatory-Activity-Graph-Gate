/**
 * Phase 1 tests: Hash collision safety (section 31)
 *
 * Proves that different semantic identities produce different IDs for:
 *   - actor:customer vs actor:merchant
 *   - two accounts with different keys
 *   - edge A→B vs edge A→C
 *   - obligation A→B vs obligation A→C
 */

import { describe, it, expect } from "vitest";
import { hashGraph } from "../../src/graph/canonical.js";
import type { ActivityGraph } from "../../src/graph/types.js";

/**
 * Build a minimal graph with one actor and one account, returning the hash.
 * Useful for isolated identity comparisons.
 */
function singleActorGraph(actorId: string, type: "CUSTOMER" | "MERCHANT"): ActivityGraph {
  return {
    hash: "",
    actors: [
      {
        id: actorId,
        label: "Test",
        type,
        derivation: "DETERMINISTIC",
        hasUnverifiedEvidence: false,
        evidenceIds: [],
      },
    ],
    accounts: [],
    moneyEdges: [],
    obligations: [],
    metadata: { commitSha: "sha", createdAt: new Date().toISOString() },
  };
}

function twoAccountGraph(acct1Id: string, acct2Id: string): ActivityGraph {
  return {
    hash: "",
    actors: [
      {
        id: "actor:owner",
        label: "Owner",
        type: "CUSTOMER",
        derivation: "DETERMINISTIC",
        hasUnverifiedEvidence: false,
        evidenceIds: [],
      },
    ],
    accounts: [
      {
        id: acct1Id,
        label: "Account 1",
        ownerActorId: "actor:owner",
        custody: "CUSTOMER",
        derivation: "DETERMINISTIC",
        hasUnverifiedEvidence: false,
        evidenceIds: [],
      },
      {
        id: acct2Id,
        label: "Account 2",
        ownerActorId: "actor:owner",
        custody: "CUSTOMER",
        derivation: "DETERMINISTIC",
        hasUnverifiedEvidence: false,
        evidenceIds: [],
      },
    ],
    moneyEdges: [],
    obligations: [],
    metadata: { commitSha: "sha", createdAt: new Date().toISOString() },
  };
}

function edgeGraph(dst: string): ActivityGraph {
  return {
    hash: "",
    actors: [
      {
        id: "actor:A",
        label: "A",
        type: "CUSTOMER",
        derivation: "DETERMINISTIC",
        hasUnverifiedEvidence: false,
        evidenceIds: [],
      },
      {
        id: "actor:B",
        label: "B",
        type: "MERCHANT",
        derivation: "DETERMINISTIC",
        hasUnverifiedEvidence: false,
        evidenceIds: [],
      },
      {
        id: "actor:C",
        label: "C",
        type: "MERCHANT",
        derivation: "DETERMINISTIC",
        hasUnverifiedEvidence: false,
        evidenceIds: [],
      },
    ],
    accounts: [
      {
        id: "acc:A",
        label: "A acc",
        ownerActorId: "actor:A",
        custody: "CUSTOMER",
        derivation: "DETERMINISTIC",
        hasUnverifiedEvidence: false,
        evidenceIds: [],
      },
      {
        id: "acc:B",
        label: "B acc",
        ownerActorId: "actor:B",
        custody: "MERCHANT",
        derivation: "DETERMINISTIC",
        hasUnverifiedEvidence: false,
        evidenceIds: [],
      },
      {
        id: "acc:C",
        label: "C acc",
        ownerActorId: "actor:C",
        custody: "MERCHANT",
        derivation: "DETERMINISTIC",
        hasUnverifiedEvidence: false,
        evidenceIds: [],
      },
    ],
    moneyEdges: [
      {
        id: "edge:test",
        label: "Test edge",
        sourceAccountId: "acc:A",
        destinationAccountId: dst,
        mechanism: "DIRECT_BANK_TRANSFER",
        derivation: "DETERMINISTIC",
        hasUnverifiedEvidence: false,
        evidenceIds: [],
      },
    ],
    obligations: [],
    metadata: { commitSha: "sha", createdAt: new Date().toISOString() },
  };
}

function obligationGraph(creditorId: string): ActivityGraph {
  return {
    hash: "",
    actors: [
      {
        id: "actor:A",
        label: "A",
        type: "CUSTOMER",
        derivation: "DETERMINISTIC",
        hasUnverifiedEvidence: false,
        evidenceIds: [],
      },
      {
        id: "actor:B",
        label: "B",
        type: "FINANCING_PROVIDER",
        derivation: "DETERMINISTIC",
        hasUnverifiedEvidence: false,
        evidenceIds: [],
      },
      {
        id: "actor:C",
        label: "C",
        type: "FINANCING_PROVIDER",
        derivation: "DETERMINISTIC",
        hasUnverifiedEvidence: false,
        evidenceIds: [],
      },
    ],
    accounts: [],
    moneyEdges: [],
    obligations: [
      {
        id: "oblig:test",
        label: "Test obligation",
        debtorActorId: "actor:A",
        creditorActorId: creditorId,
        tenorDays: 30,
        installments: 1,
        financingFeeBps: 100,
        derivation: "DETERMINISTIC",
        hasUnverifiedEvidence: false,
        evidenceIds: [],
      },
    ],
    metadata: { commitSha: "sha", createdAt: new Date().toISOString() },
  };
}

describe("hash collision safety (section 31)", () => {
  it("actor:customer != actor:merchant (same id, different type)", () => {
    const g1 = singleActorGraph("actor:test", "CUSTOMER");
    const g2 = singleActorGraph("actor:test", "MERCHANT");
    expect(hashGraph(g1)).not.toBe(hashGraph(g2));
  });

  it("actor:customer (id=A) != actor:customer (id=B) (different id)", () => {
    const g1 = singleActorGraph("actor:A", "CUSTOMER");
    const g2 = singleActorGraph("actor:B", "CUSTOMER");
    expect(hashGraph(g1)).not.toBe(hashGraph(g2));
  });

  it("two accounts with different ids in same graph produce different aggregate hash", () => {
    const g1 = twoAccountGraph("acc:X", "acc:Y");
    const g2 = twoAccountGraph("acc:X", "acc:Z");
    expect(hashGraph(g1)).not.toBe(hashGraph(g2));
  });

  it("edge A→B != edge A→C (different destination)", () => {
    const g1 = edgeGraph("acc:B");
    const g2 = edgeGraph("acc:C");
    expect(hashGraph(g1)).not.toBe(hashGraph(g2));
  });

  it("obligation A→B != obligation A→C (different creditor)", () => {
    const g1 = obligationGraph("actor:B");
    const g2 = obligationGraph("actor:C");
    expect(hashGraph(g1)).not.toBe(hashGraph(g2));
  });
});
