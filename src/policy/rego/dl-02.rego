# DL-02 — Approved Partner Structural Check
#
# Policy ID: DL-02
# Severity:  BLOCK
#
# Source: RBI Digital Lending Directions (2022), Para 8 — Lending Service
#         Provider (LSP) arrangements. An RE (Regulated Entity) engaging an
#         LSP must maintain a board-approved list of LSP partners.
# Document: "Guidelines on Digital Lending" dated September 2, 2022
# URL: https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=12382
# Clause: Para 8 — "The RE shall ensure that the Digital Lending App or
#   platform used by it or its LSPs does not store any customer data on
#   servers located outside India, and the RE shall not use the services
#   of LSPs whose names are not contained in the board-approved list
#   maintained by the RE."
# Effective: 2022-09-02
#
# What this rule detects:
#   A lending-related actor (FINANCING_PROVIDER) appearing in the proposed
#   graph whose actorId is NOT present in the approved-partners registry.
#
#   This is NOT a legal RE-LSP contract verification. It is a structural
#   internal-approval gate: if the graph shows a new FINANCING_PROVIDER actor
#   and that actor's actorId is not in the internal approved-partners list,
#   the change is blocked.
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
            "Financing provider actor '%v' (%v) is not present in the approved-partners registry. RBI Digital Lending Directions Para 8 requires board-approved LSP list. Add this partner to .regulatory/approved-partners.json before merging.",
            [actor.id, actor.label]
        ),
        "graphObjects": [{"id": actor.id, "label": actor.label}],
        "evidenceIds": actor.evidenceIds,
    }
}

allow := false if {
    count(violations) > 0
}
