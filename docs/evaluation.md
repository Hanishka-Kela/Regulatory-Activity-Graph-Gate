# Candidate-triage evaluation set

This offline set contains 40 labelled TypeScript call snippets in `fixtures/evaluation/candidate-triage.ts`. It measures the vocabulary-based candidate detector before Gemini is called; it is not a benchmark of Gemini's semantic classification.

The test derives expected labels from the fixture's exported function names, matches detections by source position, and calculates TP, FP, FN, TN, precision, and recall on every offline test run.

| Metric | Result |
| --- | --- |
| Labelled relevant calls | 20 |
| Labelled non-financial calls | 20 |
| True positives | 15 |
| False positives | 0 |
| False negatives | 5 |
| True negatives | 20 |
| Relevant-call precision | 1.00 |
| Relevant-call recall | 0.75 |

The five false negatives use `disbursement`, `settlement`, `remittance`, `refund`, and `withdrawal`, which are not in the current candidate vocabulary. This is intentional test coverage for the documented vocabulary limitation, not a claim that those calls are unimportant.

This is an offline labelled evaluation set, not a held-out dataset, end-to-end policy accuracy benchmark, fraud-detection benchmark, production dataset, or proof of overall system precision and recall.

Failsafe behavior is tested separately in the same test file. Schema-invalid fallback output and an unavailable fallback both produce `EXTRACTION_FAILSAFE` with `REVIEW`; they do not leave an otherwise passing result as `PASS`.
