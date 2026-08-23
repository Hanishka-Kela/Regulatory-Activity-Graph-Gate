# DL-01 — RBI (Digital Lending) Directions, 2025: Prohibited pool/pass-through pattern
#
# Policy ID: DL-01
# Severity:  BLOCK
#
# Source: Reserve Bank of India — (Digital Lending) Directions, 2025
# Document: "Reserve Bank of India (Digital Lending) Directions, 2025", effective 2025-05-08.
#   Consolidates and replaces the September 2, 2022 Guidelines on Digital Lending.
# URL: https://www.rbi.org.in/Scripts/NotificationUser.aspx (primary PDF is CAPTCHA-gated;
#   could not be fetched directly during this research pass)
# Clause: Para 9 (MODERATE CONFIDENCE — cross-validated via secondary-source paragraph
#   numbering against two independently-confirmed adjacent paragraphs in the same document;
#   not confirmed against RBI's primary PDF text directly. Verify before external submission.)
#   "Loan disbursal and repayment must be executed directly between the borrower's bank
#   account and the RE's bank account, without routing through any pass-through or pool
#   account of an LSP or other third party" (paraphrased from secondary sources; equivalent
#   provision in the superseded 2022 Guidelines was Para 3, "Loan Disbursal, Servicing and
#   Repayment").
# Effective: 2025-05-08
#
# What this rule detects:
#   A MoneyEdge with mechanism = POOL_PASS_THROUGH in the proposed graph.
#   This indicates funds are routed through a pool/treasury account before
#   reaching the destination — the exact pattern this clause prohibits.
#
# Scope: Loan disbursal and repayment flows only. The check is intentionally
# broad (any POOL_PASS_THROUGH edge) because the deterministic extractor sets
# this mechanism value only when the flow evidence clearly matches a pass-through
# pattern. This does NOT attempt to determine whether the product is a lending
# product — that is established by graph context. Regulatory exceptions (statutory
# mandate, co-lending between REs, specific end-use disbursal) are not encoded here
# and would require manual review if applicable.

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
            "Prohibited pool/pass-through account pattern detected on edge '%v' (%v → %v). RBI (Digital Lending) Directions, 2025, Para 9 (citation confidence: moderate — see policy-sources/dl-01.json) requires direct disbursement/repayment without third-party pool accounts.",
            [edge.id, edge.sourceAccountId, edge.destinationAccountId]
        ),
        "graphObjects": [{"id": edge.id, "label": edge.label}],
        "evidenceIds": edge.evidenceIds,
    }
}

allow := false if {
    count(violations) > 0
}
