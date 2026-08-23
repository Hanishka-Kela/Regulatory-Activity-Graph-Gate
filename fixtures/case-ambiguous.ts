/**
 * CASE 4 — AMBIGUOUS AI CASE fixture
 *
 * Scenario: Source code contains `routePayment(paymentConfig.destination, payload)`.
 * The deterministic adapter cannot resolve `paymentConfig.destination` to a concrete
 * account. The AI semantic fallback is invoked but returns UNCERTAIN confidence
 * because the destination is dynamically computed.
 *
 * This case demonstrates the AI/deterministic boundary:
 *   - EvidenceAtom: derivation = AI_INFERRED, confidence = UNCERTAIN
 *   - Graph object: hasUnverifiedEvidence = true, derivation = AI_INFERRED
 *   - Decision: REVIEW (system cannot prove the financial state is safe)
 *
 * The system MUST NOT guess a legal conclusion from uncertain evidence.
 *
 * Note: In offline test mode, the AI fallback result is replayed from this
 * fixture — no API key or network access is required for testing.
 */

import { ActivityGraphBuilder } from "../src/graph/builder.js";
import type { ActivityGraph, EvidenceAtom } from "../src/graph/types.js";

/**
 * The recorded AI fallback EvidenceAtom for the ambiguous routePayment call.
 * This is a deterministic fixture — it does NOT require a live LLM.
 */
export const ambiguousEvidenceAtom: EvidenceAtom = {
  id: "ev:ambiguous:001",
  source: {
    commitSha: "pr-commit-ambiguous-001",
    file: "src/payments/router.ts",
    span: {
      startLine: 42,
      endLine: 42,
      startColumn: 10,
      endColumn: 62,
    },
  },
  kind: "EXTERNAL_CALL",
  symbol: "routePayment",
  operation: "ROUTE",
  arguments: {
    destination: {
      type: "REFERENCE",
      expression: "paymentConfig.destination",
    },
    payload: {
      type: "REFERENCE",
      expression: "payload",
    },
  },
  execution: {
    isInsideFunction: true,
    isReachableFromExportedHandler: true,
    isAwaited: true,
  },
  derivation: "AI_INFERRED",
  confidence: "UNCERTAIN",
};

export function buildAmbiguousGraph(): ActivityGraph {
  const builder = new ActivityGraphBuilder();

  // Base actors
  builder.addActor({
    id: "actor:customer",
    label: "End Customer",
    type: "CUSTOMER",
    derivation: "DETERMINISTIC",
    hasUnverifiedEvidence: false,
    evidenceIds: ["ev:ambiguous:002"],
  });

  builder.addActor({
    id: "actor:razorpay",
    label: "Razorpay Payment Aggregator",
    type: "PAYMENT_PROVIDER",
    derivation: "DETERMINISTIC",
    hasUnverifiedEvidence: false,
    evidenceIds: ["ev:ambiguous:003"],
  });

  builder.addActor({
    id: "actor:merchant",
    label: "Merchant",
    type: "MERCHANT",
    derivation: "DETERMINISTIC",
    hasUnverifiedEvidence: false,
    evidenceIds: ["ev:ambiguous:004"],
  });

  // NEW: Unknown destination actor (AI could not resolve)
  builder.addActor({
    id: "actor:unknown_destination",
    label: "Unknown Payment Destination (unresolved: paymentConfig.destination)",
    type: "UNKNOWN",
    derivation: "AI_INFERRED",
    hasUnverifiedEvidence: true, // AI_INFERRED + UNCERTAIN → true
    evidenceIds: [ambiguousEvidenceAtom.id],
  });

  // Accounts
  builder.addAccount({
    id: "acc:customer:wallet",
    label: "Customer Payment Source",
    ownerActorId: "actor:customer",
    custody: "CUSTOMER",
    derivation: "DETERMINISTIC",
    hasUnverifiedEvidence: false,
    evidenceIds: ["ev:ambiguous:005"],
  });

  builder.addAccount({
    id: "acc:razorpay:escrow",
    label: "Razorpay Escrow/Nodal Account",
    ownerActorId: "actor:razorpay",
    custody: "ESCROW_BANK",
    derivation: "DETERMINISTIC",
    hasUnverifiedEvidence: false,
    evidenceIds: ["ev:ambiguous:006"],
  });

  builder.addAccount({
    id: "acc:merchant:bank",
    label: "Merchant Settlement Account",
    ownerActorId: "actor:merchant",
    custody: "MERCHANT",
    derivation: "DETERMINISTIC",
    hasUnverifiedEvidence: false,
    evidenceIds: ["ev:ambiguous:007"],
  });

  // NEW: Account for unknown destination — custody UNKNOWN
  builder.addAccount({
    id: "acc:unknown:destination",
    label: "Unresolved Payment Destination Account",
    ownerActorId: "actor:unknown_destination",
    custody: "UNKNOWN",
    derivation: "AI_INFERRED",
    hasUnverifiedEvidence: true,
    evidenceIds: [ambiguousEvidenceAtom.id],
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
    evidenceIds: ["ev:ambiguous:008"],
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
    evidenceIds: ["ev:ambiguous:009"],
  });

  // NEW: Ambiguous routing edge — destination is UNKNOWN
  builder.addMoneyEdge({
    id: "edge:cust-to-unknown",
    label: "routePayment(paymentConfig.destination, payload) — destination unresolved",
    sourceAccountId: "acc:customer:wallet",
    destinationAccountId: "acc:unknown:destination",
    mechanism: "UNKNOWN",
    derivation: "AI_INFERRED",
    hasUnverifiedEvidence: true,
    evidenceIds: [ambiguousEvidenceAtom.id],
  });

  return builder.build(
    "pr-commit-ambiguous-001",
    "CASE 4 — AMBIGUOUS: routePayment destination unresolved",
  );
}

export const ambiguousGraph = buildAmbiguousGraph();
