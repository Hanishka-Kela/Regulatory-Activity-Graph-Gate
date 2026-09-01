# PA-01 — RBI Payment Aggregators Master Direction 2025: Escrow topology check
#
# Policy ID: PA-01
# Severity:  REVIEW
#
# Source: RBI (Regulation of Payment Aggregators) Directions, 2025.
# Reference: RBI/DPSS/2025-26/141;
#   CO.DPSS.POLC.No.S-633/02-14-008/2025-26, dated September 15, 2025.
# URL: https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12896
# Clause: Chapter V, Paragraphs 16–18. A non-bank PA maintains merchant funds
#   in a separate escrow account with a Scheduled Commercial Bank in India.
#   Credits and debits follow all permitted categories listed in the Direction.
# Effective: 2025-09-15
#
# Demo scenario scope: PA-Online (domestic, INR). The check verifies that:
#   1. Any money edge that routes PA/RE funds directly to a MERCHANT account
#      bypassing an ESCROW_BANK account is flagged for review.
#   2. This does NOT check PA-CB or PA-P flows, which have separate requirements.
#
# What this rule detects:
#   A MoneyEdge where:
#     - sourceAccountId points to an RE or CUSTOMER custody account
#     - destinationAccountId points to a MERCHANT custody account
#     - There is NO intervening ESCROW_BANK account between customer and merchant
#
# Implementation note: The check looks for a MERCHANT-destined edge that does NOT
# originate from an ESCROW_BANK account. This catches direct
# non-escrow-to-merchant topology for review.
# This is a REVIEW (not BLOCK) because the system may not have full graph context
# to determine whether a separate escrow path already exists elsewhere in the flow.

package regulatory.pa01

import rego.v1

default allow := true

# Build a set of account IDs that have ESCROW_BANK custody
escrow_account_ids contains id if {
    account := input.proposedGraph.accounts[_]
    account.custody == "ESCROW_BANK"
    id := account.id
}

# Violation: a money edge flows directly to a MERCHANT account
# but does NOT originate from an ESCROW_BANK account
violations contains v if {
    edge := input.proposedGraph.moneyEdges[_]
    dst_account := input.proposedGraph.accounts[_]
    dst_account.id == edge.destinationAccountId
    dst_account.custody == "MERCHANT"
    # Source is NOT an escrow bank account
    not escrow_account_ids[edge.sourceAccountId]
    v := {
        "policyId": "PA-01",
        "severity": "REVIEW",
        "message": sprintf(
            "Payment flow edge '%v' routes funds directly to merchant account '%v' without passing through a designated ESCROW_BANK account. Configured prototype policy PA-01 flags this as a REVIEW heuristic under RBI (Regulation of Payment Aggregators) Directions, 2025, Chapter V, Paragraphs 16–18. The graph may not contain the full payment flow, so this result does not establish a legal violation.",
            [edge.id, edge.destinationAccountId]
        ),
        "graphObjects": [
            {"id": edge.id, "label": edge.label},
            {"id": dst_account.id, "label": dst_account.label},
        ],
        "evidenceIds": edge.evidenceIds,
    }
}

allow := false if {
    count(violations) > 0
}
