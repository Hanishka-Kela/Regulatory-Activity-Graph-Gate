# DL-03 — New Lending Obligation Requires Review
#
# Policy ID: DL-03
# Severity:  REVIEW
#
# Status: PROJECT-DEFINED SAFETY-NET RULE, not a specific numbered RBI clause.
# It sends new lending obligations for human review and makes no independent
# regulatory-compliance determination.
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
