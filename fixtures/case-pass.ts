/**
 * CASE 1 — PASS fixture
 *
 * Scenario: A developer renames a logging variable and reformats a comment.
 * No financial topology changes. The proposed graph is structurally identical
 * to the baseline.
 *
 * Expected: ΔG = empty, decision = PASS
 */

import { ActivityGraphBuilder } from "../src/graph/builder.js";
import type { ActivityGraph } from "../src/graph/types.js";

/**
 * Builds the proposed graph for CASE 1.
 * Identical topology to baseline; only the commitSha and label differ
 * (those are metadata — not part of the canonical hash).
 */
export function buildPassGraph(): ActivityGraph {
  const builder = new ActivityGraphBuilder();

  builder.addActor({
    id: "actor:customer",
    label: "End Customer",
    type: "CUSTOMER",
    derivation: "DETERMINISTIC",
    hasUnverifiedEvidence: false,
    evidenceIds: ["ev:pass:001"],
  });

  builder.addActor({
    id: "actor:razorpay",
    label: "Razorpay Payment Aggregator",
    type: "PAYMENT_PROVIDER",
    derivation: "DETERMINISTIC",
    hasUnverifiedEvidence: false,
    evidenceIds: ["ev:pass:002"],
  });

  builder.addActor({
    id: "actor:merchant",
    label: "Merchant",
    type: "MERCHANT",
    derivation: "DETERMINISTIC",
    hasUnverifiedEvidence: false,
    evidenceIds: ["ev:pass:003"],
  });

  builder.addAccount({
    id: "acc:customer:wallet",
    label: "Customer Payment Source",
    ownerActorId: "actor:customer",
    custody: "CUSTOMER",
    derivation: "DETERMINISTIC",
    hasUnverifiedEvidence: false,
    evidenceIds: ["ev:pass:004"],
  });

  builder.addAccount({
    id: "acc:razorpay:escrow",
    label: "Razorpay Escrow/Nodal Account",
    ownerActorId: "actor:razorpay",
    custody: "ESCROW_BANK",
    derivation: "DETERMINISTIC",
    hasUnverifiedEvidence: false,
    evidenceIds: ["ev:pass:005"],
  });

  builder.addAccount({
    id: "acc:merchant:bank",
    label: "Merchant Settlement Account",
    ownerActorId: "actor:merchant",
    custody: "MERCHANT",
    derivation: "DETERMINISTIC",
    hasUnverifiedEvidence: false,
    evidenceIds: ["ev:pass:006"],
  });

  builder.addMoneyEdge({
    id: "edge:cust-to-escrow",
    label: "Customer payment into escrow",
    sourceAccountId: "acc:customer:wallet",
    destinationAccountId: "acc:razorpay:escrow",
    mechanism: "ESCROW",
    derivation: "DETERMINISTIC",
    hasUnverifiedEvidence: false,
    evidenceIds: ["ev:pass:007"],
  });

  builder.addMoneyEdge({
    id: "edge:escrow-to-merchant",
    label: "Settlement from escrow to merchant",
    sourceAccountId: "acc:razorpay:escrow",
    destinationAccountId: "acc:merchant:bank",
    mechanism: "DIRECT_BANK_TRANSFER",
    settlementDelayDays: 1,
    derivation: "DETERMINISTIC",
    hasUnverifiedEvidence: false,
    evidenceIds: ["ev:pass:008"],
  });

  return builder.build("pr-commit-pass-001", "CASE 1 — PASS: logging rename");
}

export const passGraph = buildPassGraph();
