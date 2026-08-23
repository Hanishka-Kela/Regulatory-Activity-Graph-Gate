# DL-02 — Approved Partner Structural Check
#
# Policy ID: DL-02
# Severity:  BLOCK
#
# Source: RBI (Digital Lending) Directions, 2025, Para 17 (STRONG CONFIDENCE —
#         three independent secondary sources converge on this paragraph number).
#         Consolidates and replaces the September 2, 2022 Guidelines' Para 8
#         "board-approved list" requirement with a different mechanism: REs
#         must report all deployed Digital Lending Apps (DLAs) — their own and
#         their LSPs' — to RBI's Centralised Information Management System
#         (CIMS) portal, keep that list current, and have the Chief Compliance
#         Officer or a board-designated official certify its accuracy.
# Document: "Reserve Bank of India (Digital Lending) Directions, 2025"
# URL: https://www.rbi.org.in/Scripts/NotificationUser.aspx (primary PDF is
#   CAPTCHA-gated; could not be fetched directly during this research pass)
# Clause: Para 17 — CIMS reporting requirement, effective 2025-06-15 per RBI's
#   published portal-operational timeline.
# Effective: 2025-06-15
#
# What this rule detects:
#   A lending-related actor (FINANCING_PROVIDER) appearing in the proposed
#   graph whose actorId is NOT present in the approved-partners registry.
#
#   IMPORTANT: this check does NOT verify that CIMS reporting has occurred,
#   and it is NOT a legal RE-LSP contract verification. It is a structural
#   internal-governance gate: correctly certifying DLA/LSP data to RBI's CIMS
#   portal requires the RE to maintain an accurate internal record of active
#   financing partners in the first place. This rule enforces that a new
#   financing actor is tracked in that internal record (approved-partners.json)
#   before it reaches production — a necessary precondition for correct CIMS
#   certification, not a replication of the CIMS mechanism itself.
#
#   Note: checks ALL FINANCING_PROVIDER actors in the full proposedGraph,
#   not just those in the delta. This catches actors that were silently
#   added in an earlier un-reviewed change and only gain new activity in
#   this PR (per section 20 design rationale).

package regulatory.dl02

import rego.v1

default allow := true

# Build a set of approved actor IDs from the registry
approved_actor_ids contains id if {
    partner := input.approvedPartners.partners[_]
    id := partner.actorId
}

# Violation: a FINANCING_PROVIDER actor in the full proposed graph is
# not present in the approved partners registry
violations contains v if {
    actor := input.proposedGraph.actors[_]
    actor.type == "FINANCING_PROVIDER"
    not approved_actor_ids[actor.id]
    v := {
        "policyId": "DL-02",
        "severity": "BLOCK",
        "message": sprintf(
            "Financing provider actor '%v' (%v) is not present in the approved-partners registry. RBI (Digital Lending) Directions, 2025, Para 17 requires REs to maintain an accurate internal record of DLAs/LSPs before certifying them via the CIMS portal — this actor must be added to .regulatory/approved-partners.json before merging.",
            [actor.id, actor.label]
        ),
        "graphObjects": [{"id": actor.id, "label": actor.label}],
        "evidenceIds": actor.evidenceIds,
    }
}

allow := false if {
    count(violations) > 0
}
