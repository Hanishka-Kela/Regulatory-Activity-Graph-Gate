# Main aggregate policy — collects violations from all sub-policies
# and computes the final decision.
#
# Decision logic:
#   - Any BLOCK violation → decision = BLOCK
#   - Any REVIEW violation (and no BLOCK) → decision = REVIEW
#   - No violations → decision = PASS

package regulatory.main

import rego.v1
import data.regulatory.dl01
import data.regulatory.pa01
import data.regulatory.dl02
import data.regulatory.dl03

# Aggregate specific policy violations first.
specific_violations := array.concat(
    array.concat(
        array.concat(
            [v | v := dl01.violations[_]],
            [v | v := pa01.violations[_]],
        ),
        [v | v := dl02.violations[_]],
    ),
    [v | v := dl03.violations[_]],
)

delta_non_empty if { count(input.delta.addedActors) > 0 }
delta_non_empty if { count(input.delta.removedActors) > 0 }
delta_non_empty if { count(input.delta.addedAccounts) > 0 }
delta_non_empty if { count(input.delta.removedAccounts) > 0 }
delta_non_empty if { count(input.delta.addedMoneyEdges) > 0 }
delta_non_empty if { count(input.delta.removedMoneyEdges) > 0 }
delta_non_empty if { count(input.delta.changedMoneyEdges) > 0 }
delta_non_empty if { count(input.delta.addedObligations) > 0 }
delta_non_empty if { count(input.delta.removedObligations) > 0 }
delta_non_empty if { count(input.delta.changedObligations) > 0 }

topology_change_violations contains v if {
    count(specific_violations) == 0
    delta_non_empty
    v := {
        "policyId": "TOPOLOGY-CHANGE",
        "severity": "REVIEW",
        "message": "The canonical financial topology differs from the approved baseline and no more specific policy explains the change. Project-defined safety control TOPOLOGY-CHANGE requires human review; this is not an RBI requirement or legal-compliance determination.",
        "graphObjects": [],
        "evidenceIds": [],
    }
}

all_violations := array.concat(
    specific_violations,
    [v | v := topology_change_violations[_]],
)

# Decision
decision := "BLOCK" if {
    some v in all_violations
    v.severity == "BLOCK"
}

decision := "REVIEW" if {
    not any_block
    some v in all_violations
    v.severity == "REVIEW"
}

decision := "PASS" if {
    count(all_violations) == 0
}

any_block if {
    some v in all_violations
    v.severity == "BLOCK"
}
