import { describe, expect, it } from "vitest";
import { ActivityGraphBuilder } from "../../src/graph/builder.js";

const actor = (id: string) => ({ id, label: id, type: "CUSTOMER" as const, derivation: "DETERMINISTIC" as const, hasUnverifiedEvidence: false, evidenceIds: [] });
const account = (id: string, ownerActorId: string) => ({ id, label: id, ownerActorId, custody: "CUSTOMER" as const, derivation: "DETERMINISTIC" as const, hasUnverifiedEvidence: false, evidenceIds: [] });

describe("ActivityGraphBuilder referential integrity", () => {
  it("rejects an account whose owner actor is absent", () => {
    expect(() => new ActivityGraphBuilder().addAccount(account("acc:orphan", "actor:absent"))).toThrow("unknown actor");
  });

  it("rejects edges with absent endpoint accounts and obligations with absent actors", () => {
    const builder = new ActivityGraphBuilder().addActor(actor("actor:a")).addAccount(account("acc:a", "actor:a"));
    expect(() => builder.addMoneyEdge({ id: "edge:bad", label: "bad", sourceAccountId: "acc:a", destinationAccountId: "acc:missing", mechanism: "ESCROW", derivation: "DETERMINISTIC", hasUnverifiedEvidence: false, evidenceIds: [] })).toThrow("unknown destination account");
    expect(() => builder.addObligation({ id: "oblig:bad", label: "bad", debtorActorId: "actor:a", creditorActorId: "actor:missing", derivation: "DETERMINISTIC", hasUnverifiedEvidence: false, evidenceIds: [] })).toThrow("unknown creditor actor");
  });

  it("rejects duplicate IDs and duplicate financial identities", () => {
    const builder = new ActivityGraphBuilder().addActor(actor("actor:a")).addActor(actor("actor:b")).addAccount(account("acc:a", "actor:a")).addAccount(account("acc:b", "actor:b"));
    builder.addMoneyEdge({ id: "edge:one", label: "one", sourceAccountId: "acc:a", destinationAccountId: "acc:b", mechanism: "ESCROW", derivation: "DETERMINISTIC", hasUnverifiedEvidence: false, evidenceIds: [] });
    expect(() => builder.addMoneyEdge({ id: "edge:two", label: "two", sourceAccountId: "acc:a", destinationAccountId: "acc:b", mechanism: "ESCROW", derivation: "DETERMINISTIC", hasUnverifiedEvidence: false, evidenceIds: [] })).toThrow("Duplicate money edge endpoints");
    builder.addObligation({ id: "oblig:one", label: "one", debtorActorId: "actor:a", creditorActorId: "actor:b", derivation: "DETERMINISTIC", hasUnverifiedEvidence: false, evidenceIds: [] });
    expect(() => builder.addObligation({ id: "oblig:two", label: "two", debtorActorId: "actor:a", creditorActorId: "actor:b", derivation: "DETERMINISTIC", hasUnverifiedEvidence: false, evidenceIds: [] })).toThrow("Duplicate obligation parties");
  });
});
