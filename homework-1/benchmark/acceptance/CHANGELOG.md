# Acceptance suite changelog

Written from TASKS.md only, after all three runs, by a fresh agent that never read variant source.

Changes made after the first full run (both fix test assumptions that TASKS.md does not state; neither was made to rescue a specific variant):

1. **All-fields test** now creates a `transfer` (the sample request in TASKS.md) instead of a `deposit`. For a deposit, TASKS.md does not say whether `fromAccount` must be a string or may be `null`, so asserting a string type there was stricter than the spec.
2. **Summary test** searches nested objects and lists for the deposit/withdrawal totals. TASKS.md lists the four summary facts but not the response shape, so a `totalsByCurrency` nesting is valid.

Remaining failure after these changes is a real defect: Opus returns `mostRecentTransactionDate: null` for an account with two transactions.
