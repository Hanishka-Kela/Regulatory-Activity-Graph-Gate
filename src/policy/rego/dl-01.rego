# DL-01 — RBI (Digital Lending) Directions, 2025: Prohibited pool/pass-through pattern
#
# Policy ID: DL-01
# Severity:  BLOCK
#
# Source: Reserve Bank of India — (Digital Lending) Directions, 2025
# Document: "Reserve Bank of India (Digital Lending) Directions, 2025", effective 2025-05-08.
#   Consolidates and replaces the September 2, 2022 Guidelines on Digital Lending.
# Reference: RBI/2025-26/36; DOR.STR.REC.19/21.07.001/2025-26.
# URL: https://www.rbi.org.in/scripts/NotificationUser.aspx?Id=12848&Mode=0
# Clause: Paragraph 9 — Loan disbursal, servicing and repayment.
# Effective: 2025-05-08
#
# What this rule detects:
#   A MoneyEdge with mechanism = POOL_PASS_THROUGH in the proposed graph.
#   This indicates funds are routed through a pool/treasury account before
#   reaching the destination — the exact pattern this clause prohibits.
#
# Scope: Loan disbursal and repayment flows only. A proposed graph must contain
# an Obligation owed to a FINANCING_PROVIDER before a POOL_PASS_THROUGH edge is
# evaluated by this rule. Regulatory exceptions (statutory
# mandate, co-lending between REs, specific end-use disbursal) are not encoded here
# and would require manual review if applicable.

package regulatory.dl01

import rego.v1

default allow := true

# Violation: any money edge using the POOL_PASS_THROUGH mechanism
violations contains v if {
    financing_provider := input.proposedGraph.actors[_]
    financing_provider.type == "FINANCING_PROVIDER"
    obligation := input.proposedGraph.obligations[_]
    obligation.creditorActorId == financing_provider.id
    edge := input.proposedGraph.moneyEdges[_]
    edge.mechanism == "POOL_PASS_THROUGH"
    v := {
        "policyId": "DL-01",
        "severity": "BLOCK",
        "message": sprintf(
            "Pool/pass-through account topology detected on edge '%v' (%v → %v). Configured prototype policy DL-01 flags this lending-context topology for compliance review under RBI (Digital Lending) Directions, 2025, Paragraph 9; this result does not by itself establish a legal violation.",
            [edge.id, edge.sourceAccountId, edge.destinationAccountId]
        ),
        "graphObjects": [{"id": edge.id, "label": edge.label}],
        "evidenceIds": edge.evidenceIds,
    }
}

allow := false if {
    count(violations) > 0
}
