# Round 1: Opus critique of Codex plan

## 1. Where Codex is better (conceded)
- **Overdraft policy.** Codex allows overdrafts. My "store as failed + 201" rule is the most opinionated thing in my plan (my own risk #1): a grader who POSTs `status:"completed"` and gets back `failed` will think input is ignored. I concede and will allow overdrafts, documented.
- **Exact decimal check.** An epsilon float check can be wrong at the edges. Codex wants a real decimal scale check. I accept the goal but not the dependency: checking `String(amount)` with a regex (no exponent, ≤2 fraction digits) is exact for JSON numbers and needs no `decimal.js`.
- **Safe-integer guard and a lower max (1e9).** Rejecting any write whose resulting cent totals would leave the safe-integer range is cheap and correct. Adopt it.
- **ISO 4217 provenance.** Codex keeps funds/metals (XAU, XDR...) and leaves out only XTS/XXX, with the source and date recorded. ISO really does list those codes, so my exclusion was arbitrary. Adopt.
- **Strict uppercase currency.** My trim+uppercase quietly changes input; Codex rejects lowercase. Simpler, with no hidden normalisation. Adopt.
- **Balance keeps zero entries** for currencies seen in the account's history, including pending/failed. This gives the UI better output than `[]`. Adopt.
- **KPI semantics.** Codex separates ledger inflow (deposits), outflow (withdrawals) and transfers so nothing is double-counted, and uses account-relative KPIs when an account filter is set. My "top-3 volume chips" was vague. Adopt.
- **UI rigour.** "Never present a request failure as an empty ledger", the deep link `?transaction=<id>`, keeping form values after a 400, reduced motion, focus management. All of it is cheap and directly serves the brief's "clear empty and error states". Adopt.
- **run.sh hygiene.** Validating ports, never killing foreign processes, the child-exit-kills-sibling rule, and the `/health` + UI readiness gate before printing URLs. This matches mine and is stated more precisely.

## 2. Where Codex is wrong or risky against the brief
- **Rejecting unknown POST properties = automated-grader risk.** The brief's model lists `id`, `timestamp` and `status`. A grader may POST the whole model, including `id` or `timestamp`, or an extra field. A 400 there fails a core test. **Ignore unknown fields and a client `id`. Accept `timestamp` if it is valid ISO, otherwise 400.**
- **Rejecting a non-null "unused" account** (e.g. a deposit that has `fromAccount`). Graders often send both accounts for every type. The brief requires only *credit toAccount* for a deposit. Validate the format if present, store it, and ignore it for balances.
- **Rejecting unknown or repeated query params** on list/export. Cache-busters (`?_=`), `status=`, `limit=`, or a proxy can add params, and the result is a 400 on a GET that should be harmless. Ignore unknown params. Validate only the known ones.
- **Banning client timestamps.** Without a backdated `timestamp` the date-range filter can't be shown or tested with real spread-out data, and DEMO data can't exist. See the point above.
- **No sample data.** The brief explicitly invites a DEMO loader. Without one, a grader opening the UI sees an empty console and has to hand-type data to judge KPIs, filters and the table. The polish score suffers. Keep the loader, label every record DEMO, and keep it ≤20 requests (under the rate limit).
- **Stack weight vs the "run.sh installs on first run" contract.** TS + tsx + Zod + decimal.js + npm workspaces + Lucide + Vitest + Testing Library + Playwright means a larger `npm ci`, more ways the first run can fail, and **Node 22+** may not be on the grader box. Playwright browser downloads must never be in the run.sh path. JS + a hand validator gives the same exact error envelope with fewer moving parts.
- **Two-route SPA plus a test pyramid inside a time-boxed autonomous build.** Component tests plus a Playwright suite take time away from finishing Part 1, which must be 100% done. Make the API contract tests exhaustive and the UI tests a single smoke test.
- **The `npm ci` "on lockfile change" detection** needs a stored hash. That is extra script logic for no grader benefit. Install when `node_modules` is missing.
- **Interest edge values.** `rate=0` and `days=0` are allowed but meaningless. Harmless, so I'll accept them (minor).

## 3. Disagreements and recommended resolutions

| Topic | Opus position | Codex position | Recommended resolution |
|---|---|---|---|
| Language / runtime | Plain ESM JS, Node ≥18, no build | TypeScript, tsx, Node 22+ | JS (or TS with `tsx` only if Node ≥20 is enough); require Node ≥20; no workspace |
| Validation lib | Hand validators | Zod + decimal.js | Hand validators with a string-based decimal check; no extra deps |
| Overdraft | Reject → stored as `failed`, 201 | Allowed | **Codex**: allow it and document it |
| Unknown POST fields | Ignored | 400 | **Opus**: ignore |
| Client `timestamp` | Optional, validated | Forbidden | **Opus**: optional, valid ISO only |
| Unused account on a type | Optional, format-checked | Must be null | **Opus**: optional, format-checked, ignored for balance |
| Unknown / repeated query params | Ignored | 400 | **Opus**: ignore unknown; last value wins on a repeat |
| Currency set | Active codes, minus funds/metals, uppercased input | SIX List One minus XTS/XXX, uppercase only | **Codex** |
| Amount max / safety | ≤1e12, epsilon check | ≤1e9, decimal, safe-int guard | **Codex** limits, Opus no-dep implementation |
| Balance shape | `balances:[{currency,balance}]` | `balances:{USD:125.5}` | Codex map (simpler to read) with zero entries kept |
| Summary shape | `totalDeposits{}`, `totalWithdrawals{}` | `totalsByCurrency{CUR:{totalDeposits,totalWithdrawals}}` | Codex shape; field `mostRecentTransactionDate` named as in the brief |
| Error envelope for 404/429 | `details` with a field entry | `details:[]` | `details:[]` (fewer invented fields) |
| Sample data | DEMO loader, `ACC-DEMO*`, badge | None | **Opus**: loader, DEMO badge, ≤20 requests |
| UI routing | Single page + drawer | `/transactions`, `/accounts` + SPA fallback | Single page with an Accounts section; `?transaction=` deep link from Codex |
| UI tests | Build must pass + manual 390px | Component + Playwright | API supertest exhaustive; one Playwright smoke at 390px if time allows |
| Env var name | `VITE_API_URL` | `VITE_API_BASE_URL` | `VITE_API_BASE_URL` (more descriptive); run.sh defaults it from `API_PORT` |
| Install trigger | `node_modules` missing | lockfile change | `node_modules` missing |
| Rate-limit exemptions | OPTIONS | OPTIONS + `/health` | Both exempt; `RATE_LIMIT_MAX` env override kept |
