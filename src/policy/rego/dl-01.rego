# DL-01 — RBI Digital Lending Directions 2025: Prohibited pool/pass-through pattern
#
# Policy ID: DL-01
# Severity:  BLOCK
#
# Source: Reserve Bank of India — Reserve Bank of India (Digital Lending) Directions, 2025
# Reference Number: RBI/2025-26/36, DOR.STR.REC.19/21.07.001/2025-26
# Dated: May 8, 2025 (effective May 8, 2025; supersedes the Guidelines on Digital Lending
#        dated September 2, 2022 and related circulars)
# Primary URL: https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=12848
# Clause: 9(i)-(iii), Loan disbursal, servicing and repayment.
#
# Substance of the rule (confirmed against the primary Directions):
#
#   "The loan amount shall be disbursed directly into the bank account of the borrower.
#    The RE shall ensure that in no case shall the disbursal be made to a third-party
#    account, including the accounts of any LSP or DLA. All loan servicing and repayment
#    shall be executed by the borrower directly in the RE's bank account without the use
#    of any pass-through or pool account of any third party, including LSPs."
#
# The observable condition is narrower than the legal provision: it flags the graph's
# explicit POOL_PASS_THROUGH mechanism and does not model the stated exceptions.
#
# Observable graph condition: any MoneyEdge with mechanism = POOL_PASS_THROUGH.


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
            "Prohibited pool/pass-through account pattern detected on edge '%v' (%v → %v). RBI Digital Lending Directions clause 9 requires direct disbursement/repayment without third-party pool accounts.",
            [edge.id, edge.sourceAccountId, edge.destinationAccountId]
        ),
        "graphObjects": [{"id": edge.id, "label": edge.label}],
        "evidenceIds": edge.evidenceIds,
    }
}

allow := false if {
    count(violations) > 0
}
