/**
 * CASE 2 — REVIEW fixture
 *
 * Scenario: PR introduces Partner X (NBFC) with a 90-day installment loan
 * plan for the customer. New actor, new obligation, new financial semantics.
 * Partner X IS in the approved-partners registry, so DL-02 does NOT block.
 * However the new obligation introduces new regulatory exposure (DL-01 area)
 * which triggers REVIEW.
 *
 * Additions over baseline:
 *   - actor:partner_x          (FINANCING_PROVIDER)
 *   - acc:partner_x:loan_pool  (custody: RE, owner: actor:partner_x)
 *   - edge:cust-to-loan-pool   (EXTERNAL_API_ROUTING, customer wallet → loan pool)
 *   - obligation:cust-partner_x (tenorDays: 90, installments: 3, financingFeeBps: 150)
 *
 * Expected: ΔG has addedActors, addedAccounts, addedMoneyEdges, addedObligations
 *           → decision = REVIEW (new lending obligation, DL-01 review trigger)
 */

import { ActivityGraphBuilder } from "../src/graph/builder.js";
import type { ActivityGraph } from "../src/graph/types.js";

export function buildReviewGraph(): ActivityGraph {
  const builder = new ActivityGraphBuilder();

  // Existing actors (same as baseline)
  builder.addActor({
    id: "actor:customer",
    label: "End Customer",
    type: "CUSTOMER",
    derivation: "DETERMINISTIC",
    hasUnverifiedEvidence: false,
    evidenceIds: ["ev:review:001"],
  });

  builder.addActor({
    id: "actor:razorpay",
    label: "Razorpay Payment Aggregator",
    type: "PAYMENT_PROVIDER",
    derivation: "DETERMINISTIC",
    hasUnverifiedEvidence: false,
    evidenceIds: ["ev:review:002"],
  });

  builder.addActor({
    id: "actor:merchant",
    label: "Merchant",
    type: "MERCHANT",
    derivation: "DETERMINISTIC",
    hasUnverifiedEvidence: false,
    evidenceIds: ["ev:review:003"],
  });

  // NEW: Partner X (NBFC/Financing Provider)
  builder.addActor({
    id: "actor:partner_x",
    label: "Partner X NBFC",
    type: "FINANCING_PROVIDER",
    derivation: "DETERMINISTIC",
    hasUnverifiedEvidence: false,
    evidenceIds: ["ev:review:010"],
  });

  // Existing accounts (same as baseline)
  builder.addAccount({
    id: "acc:customer:wallet",
    label: "Customer Payment Source",
    ownerActorId: "actor:customer",
    custody: "CUSTOMER",
    derivation: "DETERMINISTIC",
    hasUnverifiedEvidence: false,
    evidenceIds: ["ev:review:004"],
  });

  builder.addAccount({
    id: "acc:razorpay:escrow",
    label: "Razorpay Escrow/Nodal Account",
    ownerActorId: "actor:razorpay",
    custody: "ESCROW_BANK",
    derivation: "DETERMINISTIC",
    hasUnverifiedEvidence: false,
    evidenceIds: ["ev:review:005"],
  });

  builder.addAccount({
    id: "acc:merchant:bank",
    label: "Merchant Settlement Account",
    ownerActorId: "actor:merchant",
    custody: "MERCHANT",
    derivation: "DETERMINISTIC",
    hasUnverifiedEvidence: false,
    evidenceIds: ["ev:review:006"],
  });

  // NEW: Partner X loan pool account (RE custody — regulated entity)
  builder.addAccount({
    id: "acc:partner_x:loan_pool",
    label: "Partner X Loan Disbursement Pool",
    ownerActorId: "actor:partner_x",
    custody: "RE",
    derivation: "DETERMINISTIC",
    hasUnverifiedEvidence: false,
    evidenceIds: ["ev:review:011"],
  });

  // Existing edges
  builder.addMoneyEdge({
    id: "edge:cust-to-escrow",
    label: "Customer payment into escrow",
    sourceAccountId: "acc:customer:wallet",
    destinationAccountId: "acc:razorpay:escrow",
    mechanism: "ESCROW",
    derivation: "DETERMINISTIC",
    hasUnverifiedEvidence: false,
    evidenceIds: ["ev:review:007"],
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
    evidenceIds: ["ev:review:008"],
  });

  // NEW: Customer wallet → Partner X loan pool (BNPL disbursement flow)
  builder.addMoneyEdge({
    id: "edge:cust-to-loan-pool",
    label: "BNPL disbursement: customer to Partner X loan pool",
    sourceAccountId: "acc:customer:wallet",
    destinationAccountId: "acc:partner_x:loan_pool",
    mechanism: "EXTERNAL_API_ROUTING",
    derivation: "DETERMINISTIC",
    hasUnverifiedEvidence: false,
    evidenceIds: ["ev:review:012"],
  });

  // NEW: Obligation — Customer owes Partner X (installment plan)
  builder.addObligation({
    id: "oblig:cust-partner_x",
    label: "Installment loan obligation: Customer → Partner X",
    debtorActorId: "actor:customer",
    creditorActorId: "actor:partner_x",
    tenorDays: 90,
    installments: 3,
    financingFeeBps: 150,
    derivation: "DETERMINISTIC",
    hasUnverifiedEvidence: false,
    evidenceIds: ["ev:review:013"],
  });

  return builder.build("pr-commit-review-001", "CASE 2 — REVIEW: Partner X installment plan");
}

export const reviewGraph = buildReviewGraph();
