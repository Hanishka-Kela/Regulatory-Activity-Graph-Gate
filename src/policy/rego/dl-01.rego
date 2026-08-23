# DL-01 — RBI Digital Lending Directions: Prohibited pool/pass-through pattern
#
# Policy ID: DL-01
# Severity:  BLOCK
#
# Source: Reserve Bank of India — Guidelines on Digital Lending (2022)
# Document: "Guidelines on Digital Lending" dated September 2, 2022
# URL: https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=12382
# Clause: Para 10 — "The loan amount must be disbursed directly to the end
#   borrower's bank account and loan repayment must be done directly by
#   the borrower — disbursal/repayment must not pass through a Lending
#   Service Provider or any third-party pool/pass-through account."
# Effective: 2022-09-02
#
# What this rule detects:
#   A MoneyEdge with mechanism = POOL_PASS_THROUGH in the proposed graph.
#   This indicates funds are routed through a pool/treasury account before
#   reaching the destination — the exact pattern prohibited by Para 10.
#
# Scope: Loan disbursal and repayment flows only. The check is intentionally
# broad (any POOL_PASS_THROUGH edge) because the deterministic extractor sets
# this mechanism value only when the flow evidence clearly matches a pass-through
# pattern. This does NOT attempt to determine whether the product is a lending
# product — that is established by graph context.

package regulatory.dl01

import rego.v1

default allow := true

# Violation: any money edge using the POOL_PASS_THROUGH mechanism
violations contains v if {
    edge := input.proposedGraph.moneyEdges[_]
    edge.mechanism == "POOL_PASS_THROUGH"
    v := {
        "policyId": "DL-01",
        "severity": "BLOCK",
        "message": sprintf(
            "Prohibited pool/pass-through account pattern detected on edge '%v' (%v → %v). RBI Digital Lending Directions Para 10 requires direct disbursement/repayment without third-party pool accounts.",
            [edge.id, edge.sourceAccountId, edge.destinationAccountId]
        ),
        "graphObjects": [{"id": edge.id, "label": edge.label}],
        "evidenceIds": edge.evidenceIds,
    }
}

allow := false if {
    count(violations) > 0
}
