# Main aggregate policy — collects violations from all sub-policies
# and computes the final decision.
#
# Policies aggregated (must match src/policy/evaluator.ts evaluateWithTypeScript):
#   DL-01: pool/pass-through account prohibition (BLOCK)
#   PA-01: PA escrow topology check (REVIEW)
#   DL-02: approved partner structural check (BLOCK)
#   DL-03: new lending obligation requires review (REVIEW)
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
# NOTE: must mirror the TypeScript evaluateDL01 + evaluatePA01 + evaluateDL02 + evaluateDL03
# aggregation in src/policy/evaluator.ts. Any policy added to one MUST be added to the other.
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
