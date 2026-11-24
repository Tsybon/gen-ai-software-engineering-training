Канарейка:
# Round 1 — Codex critique of Opus

Reviewed only `../../experiment/BRIEF.md`, `debate/plan-codex.md`, and `debate/plan-opus.md`.
The brief is the authority; differences from my proposal are not automatically defects.

## 1. Where Opus is better — explicit concessions

- **I concede stack economy.** Plain ESM and `node:test` reduce tooling for this small, memory-only API. My workspace/shared-package/test stack carries more setup cost. However, Opus still builds the UI, so “no build step” applies only to the API; TypeScript need not require a separate API build either.
- **I concede the single-page layout.** A drawer plus account lookup can satisfy every required UI workflow without my router and separate account page. Prefer it unless navigation demonstrably benefits from routes.
- **I concede the failed-transaction narrative.** Insufficient-funds failures with an explicit reason provide useful, explainable failed records. My allowed-overdraft policy is simpler, but less illustrative of banking behavior. Both are explicitly permitted decisions.
- **I concede UI specificity.** Opus specifies colors, touch targets, copyable IDs, and concrete DEMO badge locations more precisely than my plan. Adopt those actionable details.
- **I concede scope discipline in testing.** A blanket 80% target and my full component-test stack are less valuable than focused contract tests and a few real browser journeys. Keep my critical browser checks, reduce ceremony.

## 2. Where Opus is wrong or risky against the brief

1. **Amount validation can accept invalid money.** The epsilon check accepts a positive amount such as `0.000000000001`, then `Math.round(amount*100)` stores zero cents. That violates positive amounts and the maximum-two-decimal rule. Use decimal-safe scale validation; never round invalid input into validity. A per-record cap also does not prevent aggregate cents exceeding the safe-integer range.
2. **The ISO allowlist is narrower than the stated contract.** Excluding funds/metals such as XAU and XDR needs justification; these are ISO 4217 codes, while the brief says valid ISO codes only and gives an open-ended list. Prefer a sourced, frozen active-code dataset with explicit treatment of special codes. My own XTS/XXX exclusion also needs documenting rather than treating it as a brief requirement.
3. **`run.sh` has material lifecycle risks.** `wait -n` is unavailable in macOS's default Bash 3.2; under `set -e`, a failed wait can also bypass intended handling. `kill 0` signals the whole process group, potentially including the caller, and the trap is installed after API readiness, so an earlier failure can leave the API running. Install cleanup before starting children, track their PIDs, and supervise both portably.
4. **Launch verification is incomplete.** API-only readiness and a health/POST smoke do not establish the required working UI. Check UI readiness, overridden ports, API URL injection, child failure, and signal cleanup. Dependency installation based only on a missing `node_modules` misses changed lockfiles; reconcile it with the lockfile.
5. **KPIs silently truncate totals.** Showing only the top three currencies leaves other currencies' totals undiscoverable in the proposed KPI. “Completed volume” also needs an explicit transfer-counting definition and filter/search scope. Show every currency through expansion or another accessible view; never sum currencies together.
6. **Build success does not establish required UI behavior.** Manual width checking alone misses broken API-error mapping, details, balances, iframe interactions, and creation flows. Add a small browser acceptance suite at desktop and 390 px. Full UI unit coverage is optional.
7. **Demo timestamps and account rules add semantic ambiguity.** Client-supplied timestamps are allowed by the brief, but introduce backdated history alongside current-balance overdraft checks. Optional opposite-side accounts also make account filters/counts include records with no balance effect for that account. Either retain my server timestamps and type-specific accounts, or document and test these distinctions explicitly.
8. **Some claims understate work.** All four extras are not reliably “about 20 lines” once validation, CSV, money, limiter cleanup and tests are included. The brief requires only one extra: secure core/API/UI/run-contract completion before spending the remaining budget on all four.

Overdraft rejection, returning 201 for a stored failed record, currency normalization, extra `failureReason`, and array-shaped balances are **not brief violations**. They are policy/contract choices that need consistency and documentation. My stricter unknown-field rules are likewise optional.

## 3. Concrete disagreements and recommended resolutions

| Topic | Codex position | Opus position | Recommended resolution |
|---|---|---|---|
| API/tooling | TypeScript, Zod, shared workspace | Plain ESM, hand validators | Prefer Opus's smaller layout; retain typed contracts if inexpensive. Exact validation behavior matters more than the tool. |
| UI navigation | Transactions/accounts routes | Single page and drawer | Adopt Opus's single page; preserve clear account navigation and details dismissal. |
| Money precision | Decimal scale checks; safe aggregate cents | Epsilon check; rounded cents; larger cap | Adopt decimal-safe validation and check resulting aggregates before mutation. |
| Overdrafts | Allow negative balances | Store failed transaction with reason, 201 | Adopt Opus's policy with visible failure feedback, atomic checks, and documented 201 semantics. |
| Timestamps | Server-generated only | Optional client timestamp for demos | Keep server timestamps initially; date spreading alone does not justify another input contract. |
| Opposite-side accounts | Reject unused account field | Accept if well-formed | Prefer type-specific accounts; avoid misleading account history and counts. |
| Currency set/input | Sourced active list; uppercase only | Exclude funds/metals; trim/uppercase | Use sourced active codes; normalization is acceptable if documented and returned canonically. |
| Balance response | Currency-keyed object | Sorted currency array | Either meets the brief; choose Opus's array and freeze one API/UI contract. |
| KPI meaning | Explicit inflow/outflow and filter scope | Completed volume, top three currencies | Define volume and scope; make all per-currency totals accessible. |
| Demo feature | Start empty; no seed feature | About 15 API-created DEMO records | Defer until core passes; if retained, badge every sample, prevent duplicate loads, and report partial failure. |
| Extras | All four, detailed contracts | All four, estimated trivial | Deliver summary first; add remaining extras only after required workflows pass. |
| Tests | Broad unit/component/browser suite | API suite, build, manual UI | Keep Opus's lean API tests plus focused browser journeys, date boundaries, and money overflow checks. |
| Launcher | Tracked children, readiness, cleanup | Late `kill 0` trap and `wait -n` | Use early PID-scoped cleanup, portable supervision, both-service readiness and alternate-port smoke tests. |

The shared strengths worth preserving are completed-only per-currency balances, integer-cent sums, AND-combined filters, inclusive date-only upper bounds, exact validation envelopes, and registering CSV before `/:id`.
