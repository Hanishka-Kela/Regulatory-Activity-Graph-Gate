# DL-02 — Approved Partner Structural Check
#
# Policy ID: DL-02
# Severity:  BLOCK
#
# Source: Reserve Bank of India — Reserve Bank of India (Digital Lending) Directions, 2025
# Reference Number: RBI/2025-26/36, DOR.STR.REC.19/21.07.001/2025-26
# Dated: May 8, 2025 (effective May 8, 2025; supersedes the Guidelines on Digital Lending
#        dated September 2, 2022 and related circulars)
# Primary URL: https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=12848
#
# Regulatory context (confirmed against the primary Directions):
#
#   Clauses 5(i)-(vii), 8(iv)(b), and 17(i)-(vii) require RE-LSP due diligence and
#   accountability, public disclosure of LSPs/DLAs, and DLA reporting to RBI's CIMS portal.
#   The "board-approved list" language from Para 8 of the superseded 2022 Guidelines is
#   not the formulation used in the 2025 Directions. The system operationalises the
#   current obligations as an internal gate:
#   any FINANCING_PROVIDER actor not present in the approved-partners registry constitutes
#   an undisclosed/unvouched LSP engagement and must be reviewed before release.
#
# Design note: this gate is internal-structural, not a legal RE-LSP contract verification.
# The regulatory substance (RE must maintain LSP accountability and disclose all engaged
# partners) is current as of 2025. The specific gate mechanism (internal approved-partners
# registry) is an implementation choice of this system.
#
# Observable graph condition: any Actor with type = FINANCING_PROVIDER in the full
# proposed graph whose actorId is not present in .regulatory/approved-partners.json.


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
            "Financing provider actor '%v' (%v) is not present in the approved-partners registry. RBI Digital Lending Directions clauses 5, 8(iv)(b), and 17 require LSP accountability and disclosure. Add this partner to .regulatory/approved-partners.json before merging.",
            [actor.id, actor.label]
        ),
        "graphObjects": [{"id": actor.id, "label": actor.label}],
        "evidenceIds": actor.evidenceIds,
    }
}

allow := false if {
    count(violations) > 0
}
