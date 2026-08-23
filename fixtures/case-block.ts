/**
 * CASE 3 — BLOCK fixture
 *
 * Scenario: The approved flow routes funds through a proper ESCROW_BANK account.
 * The proposed change replaces it with a third-party treasury/pool account
 * (POOL_PASS_THROUGH mechanism, THIRD_PARTY custody) before settling to the merchant.
 *
 * This violates DL-01 (RBI Digital Lending Direction: loan disbursement/repayment
 * must flow directly — prohibited pass-through/pool account pattern).
 *
 * Delta:
 *   - removedMoneyEdges: edge (customer → escrow)       [ESCROW mechanism gone]
 *   - removedMoneyEdges: edge (escrow → merchant)       [DIRECT_BANK_TRANSFER gone]
 *   - removedAccounts:   acc:razorpay:escrow
 *   - addedAccounts:     acc:treasury:pool               (custody: THIRD_PARTY)
 *   - addedMoneyEdges:   edge (customer → treasury pool) (POOL_PASS_THROUGH)
 *   - addedMoneyEdges:   edge (treasury pool → merchant)  (DIRECT_BANK_TRANSFER)
 *
 * Expected: decision = BLOCK (DL-01 violation: POOL_PASS_THROUGH detected)
 */

import { ActivityGraphBuilder } from "../src/graph/builder.js";
import type { ActivityGraph } from "../src/graph/types.js";

export function buildBlockGraph(): ActivityGraph {
  const builder = new ActivityGraphBuilder();

  // Actors — same as baseline
  builder.addActor({
    id: "actor:customer",
    label: "End Customer",
    type: "CUSTOMER",
    derivation: "DETERMINISTIC",
    hasUnverifiedEvidence: false,
    evidenceIds: ["ev:block:001"],
  });

  builder.addActor({
    id: "actor:razorpay",
    label: "Razorpay Payment Aggregator",
    type: "PAYMENT_PROVIDER",
    derivation: "DETERMINISTIC",
    hasUnverifiedEvidence: false,
    evidenceIds: ["ev:block:002"],
  });

  builder.addActor({
    id: "actor:merchant",
    label: "Merchant",
    type: "MERCHANT",
    derivation: "DETERMINISTIC",
    hasUnverifiedEvidence: false,
    evidenceIds: ["ev:block:003"],
  });

  // NEW: Third-party treasury actor
  builder.addActor({
    id: "actor:treasury",
    label: "Third-Party Treasury Operator",
    type: "THIRD_PARTY",
    derivation: "DETERMINISTIC",
    hasUnverifiedEvidence: false,
    evidenceIds: ["ev:block:010"],
  });

  // CHANGED: No escrow account — replaced by third-party pool
  builder.addAccount({
    id: "acc:customer:wallet",
    label: "Customer Payment Source",
    ownerActorId: "actor:customer",
    custody: "CUSTOMER",
    derivation: "DETERMINISTIC",
    hasUnverifiedEvidence: false,
    evidenceIds: ["ev:block:004"],
  });

  // NEW: Third-party treasury pool (custody: THIRD_PARTY — trigger for DL-01)
  builder.addAccount({
    id: "acc:treasury:pool",
    label: "Third-Party Treasury Pool Account",
    ownerActorId: "actor:treasury",
    custody: "THIRD_PARTY",
    derivation: "DETERMINISTIC",
    hasUnverifiedEvidence: false,
    evidenceIds: ["ev:block:011"],
  });

  builder.addAccount({
    id: "acc:merchant:bank",
    label: "Merchant Settlement Account",
    ownerActorId: "actor:merchant",
    custody: "MERCHANT",
    derivation: "DETERMINISTIC",
    hasUnverifiedEvidence: false,
    evidenceIds: ["ev:block:005"],
  });

  // NEW edges: pass-through pattern (DL-01 prohibited)
  builder.addMoneyEdge({
    id: "edge:cust-to-pool",
    label: "Customer payment → third-party treasury pool",
    sourceAccountId: "acc:customer:wallet",
    destinationAccountId: "acc:treasury:pool",
    mechanism: "POOL_PASS_THROUGH",
    derivation: "DETERMINISTIC",
    hasUnverifiedEvidence: false,
    evidenceIds: ["ev:block:012"],
  });

  builder.addMoneyEdge({
    id: "edge:pool-to-merchant",
    label: "Pass-through from treasury pool to merchant",
    sourceAccountId: "acc:treasury:pool",
    destinationAccountId: "acc:merchant:bank",
    mechanism: "DIRECT_BANK_TRANSFER",
    settlementDelayDays: 1,
    derivation: "DETERMINISTIC",
    hasUnverifiedEvidence: false,
    evidenceIds: ["ev:block:013"],
  });

  return builder.build("pr-commit-block-001", "CASE 3 — BLOCK: pool pass-through");
}

export const blockGraph = buildBlockGraph();
