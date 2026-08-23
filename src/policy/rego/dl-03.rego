# DL-03 — New Lending Obligation Requires Review
#
# Policy ID: DL-03
# Severity:  REVIEW
#
# Source: RBI Digital Lending Directions (2022), General Principle.
#         Any new lending obligation introduced into an approved topology
#         constitutes a material financial activity change requiring human
#         review before release, regardless of whether the lending partner
#         is already in the approved registry.
#
# Document: Guidelines on Digital Lending, September 2, 2022
# URL: https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=12382
# Clause: Para 2 (Definitions) + Para 5 (Compliance) — Regulated Entities
#         must ensure that new lending arrangements are subject to compliance
#         review before operationalizing.
# Effective: 2022-09-02
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
            "New lending obligation detected: '%v' (%v → %v, tenorDays=%v, installments=%v, feeBps=%v). New financing relationships require compliance review per RBI Digital Lending Directions before release.",
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
