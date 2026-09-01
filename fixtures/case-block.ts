/**
 * CASE 3 — BLOCK fixture
 *
 * Scenario: Partner X, a financing provider, disburses a loan to a borrower
 * through a third-party pool account instead of directly to the borrower's
 * bank account. The graph includes the lending obligation that establishes
 * the Digital Lending context for DL-01.
 *
 * Expected: BLOCK. The prototype flags a topology associated with DL-01 and
 * requires compliance review; it does not itself establish a legal violation.
 */

import { ActivityGraphBuilder } from "../src/graph/builder.js";
import type { ActivityGraph } from "../src/graph/types.js";

export function buildBlockGraph(): ActivityGraph {
  const builder = new ActivityGraphBuilder();

  builder.addActor({ id: "actor:borrower", label: "Borrower", type: "CUSTOMER", derivation: "DETERMINISTIC", hasUnverifiedEvidence: false, evidenceIds: ["ev:block:001"] });
  builder.addActor({ id: "actor:partner_x", label: "Partner X NBFC", type: "FINANCING_PROVIDER", derivation: "DETERMINISTIC", hasUnverifiedEvidence: false, evidenceIds: ["ev:block:002"] });
  builder.addActor({ id: "actor:treasury", label: "Third-Party Pool Operator", type: "THIRD_PARTY", derivation: "DETERMINISTIC", hasUnverifiedEvidence: false, evidenceIds: ["ev:block:003"] });

  builder.addAccount({ id: "acc:partner_x:disbursement", label: "Partner X Disbursement Account", ownerActorId: "actor:partner_x", custody: "RE", derivation: "DETERMINISTIC", hasUnverifiedEvidence: false, evidenceIds: ["ev:block:004"] });
  builder.addAccount({ id: "acc:treasury:pool", label: "Third-Party Loan Disbursal Pool", ownerActorId: "actor:treasury", custody: "THIRD_PARTY", derivation: "DETERMINISTIC", hasUnverifiedEvidence: false, evidenceIds: ["ev:block:005"] });
  builder.addAccount({ id: "acc:borrower:bank", label: "Borrower Bank Account", ownerActorId: "actor:borrower", custody: "CUSTOMER", derivation: "DETERMINISTIC", hasUnverifiedEvidence: false, evidenceIds: ["ev:block:006"] });

  builder.addMoneyEdge({ id: "edge:lender-to-pool", label: "Loan disbursal to third-party pool", sourceAccountId: "acc:partner_x:disbursement", destinationAccountId: "acc:treasury:pool", mechanism: "POOL_PASS_THROUGH", derivation: "DETERMINISTIC", hasUnverifiedEvidence: false, evidenceIds: ["ev:block:007"] });
  builder.addMoneyEdge({ id: "edge:pool-to-borrower", label: "Loan disbursal from pool to borrower", sourceAccountId: "acc:treasury:pool", destinationAccountId: "acc:borrower:bank", mechanism: "DIRECT_BANK_TRANSFER", derivation: "DETERMINISTIC", hasUnverifiedEvidence: false, evidenceIds: ["ev:block:008"] });

  builder.addObligation({ id: "obligation:borrower:partner_x", label: "Borrower loan obligation to Partner X", debtorActorId: "actor:borrower", creditorActorId: "actor:partner_x", tenorDays: 90, installments: 3, financingFeeBps: 150, derivation: "DETERMINISTIC", hasUnverifiedEvidence: false, evidenceIds: ["ev:block:009"] });

  return builder.build("pr-commit-block-001", "CASE 3 — BLOCK: loan disbursal through pool");
}

export const blockGraph = buildBlockGraph();
