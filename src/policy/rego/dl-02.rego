# DL-02 — Approved Partner Structural Check
#
# Policy ID: DL-02
# Severity:  BLOCK
#
# Source context: RBI (Digital Lending) Directions, 2025, Paragraph 17.
# Document: "Reserve Bank of India (Digital Lending) Directions, 2025"
# Reference: RBI/2025-26/36; DOR.STR.REC.19/21.07.001/2025-26.
# URL: https://www.rbi.org.in/scripts/NotificationUser.aspx?Id=12848&Mode=0
# Effective: 2025-05-08
#
# What this rule detects:
#   A lending-related actor (FINANCING_PROVIDER) appearing in the proposed
#   graph whose actorId is NOT present in the approved-partners registry.
#
#   This is a project-defined internal governance control derived from the need
#   to track financing providers and maintain accurate regulatory reporting. It
#   does not directly implement Paragraph 17 or prove CIMS compliance.
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
            "Financing provider actor '%v' (%v) is not present in the approved-partners registry. Project-defined internal governance control DL-02, derived from the reporting context in RBI (Digital Lending) Directions, 2025, Paragraph 17, requires review before merging. It does not prove CIMS compliance.",
            [actor.id, actor.label]
        ),
        "graphObjects": [{"id": actor.id, "label": actor.label}],
        "evidenceIds": actor.evidenceIds,
    }
}

allow := false if {
    count(violations) > 0
}
