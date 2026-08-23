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

# Aggregate all violations from all policies
all_violations := array.concat(
    array.concat(
        array.concat(
            [v | v := dl01.violations[_]],
            [v | v := pa01.violations[_]],
        ),
        [v | v := dl02.violations[_]],
    ),
    [v | v := dl03.violations[_]],
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
