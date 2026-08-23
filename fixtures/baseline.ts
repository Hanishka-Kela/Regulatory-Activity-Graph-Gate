/**
 * Baseline fixture: approved PA flow topology
 *
 * Graph:
 *   Customer → [ESCROW mechanism] → Escrow Bank → [DIRECT_BANK_TRANSFER] → Merchant
 *
 * Actors:
 *   - customer_01  (CUSTOMER)
 *   - razorpay_01  (PAYMENT_PROVIDER)
 *   - merchant_01  (MERCHANT)
 *
 * Accounts:
 *   - acc_customer_wallet  (custody: CUSTOMER,    owner: customer_01)
 *   - acc_razorpay_escrow  (custody: ESCROW_BANK, owner: razorpay_01)
 *   - acc_merchant_bank    (custody: MERCHANT,    owner: merchant_01)
 *
 * MoneyEdges:
 *   - edge_cust_to_escrow   (CUSTOMER_WALLET → ESCROW,   mechanism: ESCROW)
 *   - edge_escrow_to_merch  (ESCROW → MERCHANT_BANK,     mechanism: DIRECT_BANK_TRANSFER, settlementDelayDays: 1)
 *
 * This is the approved baseline for PA-01 compliance checks.
 * Commit SHA is pinned as "baseline-commit-001" for fixture determinism.
 */

import { ActivityGraphBuilder } from "../src/graph/builder.js";
import type { ActivityGraph } from "../src/graph/types.js";

export function buildBaselineGraph(): ActivityGraph {
  const builder = new ActivityGraphBuilder();

  // Actors
  builder.addActor({
    id: "actor:customer",
    label: "End Customer",
    type: "CUSTOMER",
    derivation: "DETERMINISTIC",
    hasUnverifiedEvidence: false,
    evidenceIds: ["ev:baseline:001"],
  });

  builder.addActor({
    id: "actor:razorpay",
    label: "Razorpay Payment Aggregator",
    type: "PAYMENT_PROVIDER",
    derivation: "DETERMINISTIC",
    hasUnverifiedEvidence: false,
    evidenceIds: ["ev:baseline:002"],
  });

  builder.addActor({
    id: "actor:merchant",
    label: "Merchant",
    type: "MERCHANT",
    derivation: "DETERMINISTIC",
    hasUnverifiedEvidence: false,
    evidenceIds: ["ev:baseline:003"],
  });

  // Accounts
  builder.addAccount({
    id: "acc:customer:wallet",
    label: "Customer Payment Source",
    ownerActorId: "actor:customer",
    custody: "CUSTOMER",
    derivation: "DETERMINISTIC",
    hasUnverifiedEvidence: false,
    evidenceIds: ["ev:baseline:004"],
  });

  builder.addAccount({
    id: "acc:razorpay:escrow",
    label: "Razorpay Escrow/Nodal Account",
    ownerActorId: "actor:razorpay",
    custody: "ESCROW_BANK",
    derivation: "DETERMINISTIC",
    hasUnverifiedEvidence: false,
    evidenceIds: ["ev:baseline:005"],
  });

  builder.addAccount({
    id: "acc:merchant:bank",
    label: "Merchant Settlement Account",
    ownerActorId: "actor:merchant",
    custody: "MERCHANT",
    derivation: "DETERMINISTIC",
    hasUnverifiedEvidence: false,
    evidenceIds: ["ev:baseline:006"],
  });

  // Money edges
  builder.addMoneyEdge({
    id: "edge:cust-to-escrow",
    label: "Customer payment into escrow",
    sourceAccountId: "acc:customer:wallet",
    destinationAccountId: "acc:razorpay:escrow",
    mechanism: "ESCROW",
    derivation: "DETERMINISTIC",
    hasUnverifiedEvidence: false,
    evidenceIds: ["ev:baseline:007"],
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
    evidenceIds: ["ev:baseline:008"],
  });

  return builder.build("baseline-commit-001", "Approved PA Baseline");
}

/** Pre-built singleton for use in tests and policy evaluation */
export const baselineGraph = buildBaselineGraph();
