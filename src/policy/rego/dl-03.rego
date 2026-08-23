# DL-03 — New Lending Obligation Requires Review
#
# Policy ID: DL-03
# Severity:  REVIEW
#
# Status: PROJECT-DEFINED SAFETY-NET RULE, not a specific numbered RBI clause.
#   An earlier draft of this file cited "Para 2 (Definitions) + Para 5
#   (Compliance)" of the 2022 Guidelines — that citation could not be
#   corroborated by any source during citation verification and has been
#   removed rather than left in place looking more authoritative than it is.
#   Per the project's own principle ("do not implement a rule that cannot be
#   confidently mapped to a primary source"), this rule is instead justified
#   directly: it is REVIEW severity, not BLOCK, so the cost of being
#   conservative here is a human review step, not a false BLOCK — consistent
#   with Principle 8 (if the system cannot safely determine the financial
#   state, REVIEW is safer than PASS).
#
# Rationale: RBI's digital lending framework (both the superseded 2022
# Guidelines and the current 2025 Directions) treats new lending arrangements
# generally as requiring compliance oversight before going live — see DL-01
# and DL-02's citations for the specific, corroborated provisions this general
# posture is built on. DL-03 applies that same posture at the point a new
# Obligation appears in the graph, independent of whether the specific
# provisions DL-01/DL-02 check are also triggered.
#
# What this rule detects:
#   Any Obligation present in the DELTA (addedObligations) that represents a
#   new lending relationship (debtor + creditor with financing terms).
#   This is a REVIEW trigger, not a BLOCK — the human reviewer decides
#   whether the lending arrangement is permissible.
#
# Note: This rule is intentionally conservative: new obligations always trigger
# REVIEW, even if the creditor is an approved partner. The human reviewer must
# confirm that the specific obligation terms (tenor, installments, feeBps) were
# part of the approved engagement.

package regulatory.dl03

import rego.v1

default allow := true

violations contains v if {
    oblig := input.delta.addedObligations[_]
    v := {
        "policyId": "DL-03",
        "severity": "REVIEW",
        "message": sprintf(
            "New lending obligation detected: '%v' (%v → %v, tenorDays=%v, installments=%v, feeBps=%v). New financing relationships always require human compliance review before release, per project policy DL-03 (see policy-sources/dl-03.json for rationale).",
            [
                oblig.id,
                oblig.debtorActorId,
                oblig.creditorActorId,
                object.get(oblig, "tenorDays", "N/A"),
                object.get(oblig, "installments", "N/A"),
                object.get(oblig, "financingFeeBps", "N/A"),
            ]
        ),
        "graphObjects": [{"id": oblig.id, "label": oblig.label}],
        "evidenceIds": oblig.evidenceIds,
    }
}

allow := false if {
    count(violations) > 0
}
