# Plan (Opus): Banking Transactions API + UI, synergy variant

## 1. Stack, and why
- **API: Node 20+, Express 4, plain ESM JavaScript, deps `express` and `cors` only.** There is no build step, so nothing extra can fail in run.sh. The in-memory store is a JS array.
- **UI: Vite + React 18 + hand-written CSS (custom properties).** No UI kit and no Tailwind. The dark fintech look comes from about 300 lines of CSS tokens. We build at startup and serve with `vite preview`.
- **Tests: `node:test` + `supertest`** (dev dep). No Jest config.
- Not used: TypeScript (needs a build step and slows a small app), zod (hand validators are clearer for an exact error shape), a database (the brief forbids one).

## 2. Folder structure
```
synergy/
  run.sh  README.md
  api/
    package.json
    src/server.js        # listen on API_PORT
    src/app.js           # express app factory (tests import this)
    src/store.js         # in-memory array + reset()
    src/currencies.js    # ISO 4217 active code Set (static)
    src/validation.js    # validateTransaction, validateFilters, ValidationError
    src/balance.js       # computeBalances(accountId) -> per-currency cents
    src/csv.js           # toCsv(rows)
    src/rateLimit.js     # fixed-window per-IP middleware
    src/routes/transactions.js  src/routes/accounts.js
    test/*.test.js
  ui/
    package.json vite.config.js index.html
    src/main.jsx App.jsx api.js styles.css demo.js
    src/components/{KpiCards,TxTable,Filters,TxForm,TxDrawer,Balances,EmptyState,ErrorBanner}.jsx
```

## 3. Data model and business rules
Transaction: `{id, fromAccount, toAccount, amount, currency, type, timestamp, status}`, plus `failureReason` (string|null).
- `id`: `crypto.randomUUID()`.
- `timestamp`: the server sets `new Date().toISOString()`. The client may send an optional valid ISO 8601 `timestamp`, which demo data needs for spread-out dates. Invalid values give 400.
- **Initial status: `completed` by default.** The client may set an optional `status` of pending|completed|failed (for simulation or demo). Reason: graders will create a deposit and then check the balance, and `pending` by default would make that look broken.
- **Required accounts per type:**
  - deposit: `toAccount` required. `fromAccount` is optional (null if missing) and must be well-formed if given.
  - withdrawal: `fromAccount` required. `toAccount` optional (null).
  - transfer: both required and they must differ. Same account gives 400 on field `toAccount`.
- **Overdraft: not allowed.** If a `completed` withdrawal or transfer would take the `fromAccount` balance in that currency below 0, it is still stored, with `status:"failed"` and `failureReason:"Insufficient funds"`, and returns **201**. That gives real failed records for the "failed" KPI and an audit trail. Pending and failed requests skip the check.
- **Balances per currency:** computed on read from completed transactions, using integer cents (`Math.round(amount*100)`) to avoid float drift. Response: `{accountId, balances:[{currency, balance}]}`, sorted by currency. A well-formed account with no transactions gets 200 and `balances: []`, not 404, because accounts are implicit. A malformed accountId gives 400.
- **Amount:** must be a JSON number (strings such as `"100"` are rejected), finite, > 0, at most 2 decimals (check `Math.abs(a*100 - Math.round(a*100)) < 1e-9`), and ≤ 1e12. JPY gets no special case and also allows 2 decimals (documented).
- **Account:** `/^ACC-[A-Za-z0-9]{5}$/`, case-sensitive.
- **Currency: static Set of the ~180 active ISO 4217 alpha codes** in `currencies.js` (from the ISO list, without funds/metals such as XAU and XDR). Input is trimmed and upper-cased, then checked. `Intl.supportedValuesOf('currency')` is not used because it changes with the ICU build and includes historic codes.
- **type:** deposit|withdrawal|transfer, exact lowercase.
- **Unknown body fields:** ignored, not stored.

## 4. Filters (`GET /transactions`)
- `accountId`: matches `fromAccount === id || toAccount === id`. It must be well-formed, else 400.
- `type`: must be a valid enum, else 400.
- `from` / `to`: accept `YYYY-MM-DD` or a full ISO datetime, in UTC. **Both ends inclusive.** A date-only `to` means the end of that day (`T23:59:59.999Z`) and a date-only `from` means `T00:00:00.000Z`. `from > to` gives 400.
- Any combination is ANDed. Results are sorted by timestamp, newest first. No pagination (YAGNI; noted in README).

## 5. Validation and error format
One `ValidationError(details[])` is thrown from the validators and caught by the error middleware. **All** field errors are collected, not just the first. Exact body:
```json
{"error":"Validation failed","details":[{"field":"amount","message":"Amount must be a positive number"}]}
```
Messages (fixed strings, tested):
- amount: "Amount is required" / "Amount must be a positive number" / "Amount must have at most 2 decimal places"
- currency: "Currency is required" / "Invalid currency code"
- fromAccount/toAccount: "<field> is required for <type>" / "Account must match format ACC-XXXXX" / "fromAccount and toAccount must differ"
- type: "Type must be one of deposit, withdrawal, transfer"
- Malformed JSON gives 400 `{"error":"Validation failed","details":[{"field":"body","message":"Malformed JSON"}]}`.

Other errors use the same envelope:
- 404 `{"error":"Not found","details":[{"field":"id","message":"Transaction not found"}]}`
- 429 `{"error":"Too Many Requests","details":[{"field":"ip","message":"Rate limit of 100 requests per minute exceeded"}]}`
- 500 `{"error":"Internal server error","details":[]}`, with the stack logged on the server only.

Status codes: 201 create, 200 reads, 400, 404, 429.

## 6. Task 4: implement all four (each is about 20 lines)
- **A** `GET /accounts/:id/summary` returns `{accountId, totalDeposits:{USD:..}, totalWithdrawals:{..}, transactionCount, mostRecentTransactionDate|null}`. Totals are per currency, because adding USD to JPY is meaningless. They count completed transactions only: deposits = credits to the account (deposit + incoming transfer), withdrawals = debits (withdrawal + outgoing transfer). The count includes every status.
- **B** `GET /accounts/:id/interest?rate=0.05&days=30` uses simple interest `balance*rate*days/365`, per currency, rounded to 2 decimals. Validation: rate is a number with 0 < rate ≤ 1, and days is an integer with 1 ≤ days ≤ 36500. Response: `{accountId, rate, days, results:[{currency, balance, interest, projectedBalance}]}`.
- **C** `GET /transactions/export?format=csv` accepts the same filters as the list. RFC 4180 quoting, `text/csv`, `Content-Disposition: attachment; filename=transactions.csv`. A format other than csv gives 400. **The route is registered before `/:id`.**
- **D** Rate limit: a fixed 60 s window per `req.ip`, with a Map that is cleaned up on each window roll. Limit from `RATE_LIMIT_MAX` (default 100). OPTIONS preflight is exempt. Sets `X-RateLimit-Limit/Remaining` and `Retry-After`. Tests create the app with a small limit.
- Also: `GET /health` returns `{ok:true}`, for run.sh and the UI's API-unreachable detection.

## 7. UI: pages, components, design
A single page with no router. The detail view is a right-side drawer; on phones it is a full-screen sheet.
- **Header:** product name, an API status dot (polls /health), a "Load sample data" button, and a "New transaction" button.
- **KpiCards:** total transactions, completed volume per currency (top 3 currencies as chips), pending count, and a failed count in a red accent. Computed client-side from the list.
- **Filters:** a search box (client-side substring over id/accounts), an account input, a type segmented control, from/to date inputs, Clear, and "Export CSV" (a link to the export URL with the current filters). The account, type and date filters are sent to the API.
- **TxTable:** time, type badge, from → to, amount (tabular-nums, right-aligned, currency suffix), status pill. A row click opens the drawer. Below 640px the rows become stacked cards.
- **TxDrawer:** every field, a copyable id, failureReason, and links to each account's balance.
- **TxForm** (modal): type first, and the account fields shown or hidden per type. API `details[]` are mapped to inline messages under each field, plus a summary banner. No client-side validation duplication beyond HTML `required`, because the API is the source of truth.
- **Balances:** an account lookup that shows per-currency balance cards with summary and interest (rate/days inputs) underneath.
- **States:** EmptyState (no data, with a CTA for sample data and a new transaction), no filter matches, loading skeletons, and an ErrorBanner when the API is unreachable (with Retry and the configured URL shown).
- **DEMO:** the sample loader posts about 15 transactions through the normal API using accounts `ACC-DEMO1`, `ACC-DEMO2` and `ACC-DEMO3` (valid format) with spread-out timestamps. Any record touching an `ACC-DEMO*` account gets a visible amber **DEMO** badge in the table, cards and drawer.
- **Design:** background #0B0F14, surface #121821, border #1F2A37, text #E6EDF3 / muted #8B98A5, accent cyan #22D3EE, success #34D399, warning #FBBF24, danger #F87171. Inter for text and JetBrains Mono for ids and amounts (Google Fonts, falling back to system). 8px grid, 12px radius, subtle 1px borders, no heavy shadows. Visible focus rings, 44px touch targets, labelled inputs, `aria-live` for errors. Must work at 390px with no horizontal scroll.
- **API base URL:** `import.meta.env.VITE_API_URL`. run.sh exports `VITE_API_URL=${API_URL:-http://localhost:$API_PORT}` before the build.

## 8. Testing
- API (`npm test` in api/): supertest against `createApp({rateLimitMax})`, with `store.reset()` in `beforeEach`.
  - create: 201 for each type, with defaults (status completed, id, timestamp).
  - Each validation message, multiple errors at once, malformed JSON, and strings rejected as amount.
  - Required-account rules per type, same-account transfer.
  - Balances: per currency; pending and failed ignored; transfer debit and credit; cents precision (0.1+0.2).
  - Overdraft gives a failed record and an unchanged balance.
  - Filters: each alone and combined, date-only `to` inclusive, bad params give 400.
  - 404 for an unknown id; summary, interest, CSV quoting and filters; 429 after N+1 requests; CORS header present.
- UI: `vite build` must pass (run.sh fails loudly otherwise). No UI unit tests (YAGNI). A manual check at 390px.
- Smoke: `run.sh` followed by a curl of /health and a POST.

## 9. run.sh
- `#!/usr/bin/env bash`, `set -euo pipefail`, `cd "$(dirname "$0")"`.
- `API_PORT=${API_PORT:-3003}`, `UI_PORT=${UI_PORT:-5103}`, `VITE_API_URL=${API_URL:-http://localhost:$API_PORT}`.
- Checks that `node` ≥ 18 exists and exits with a clear message if not.
- Runs `npm install --no-audit --no-fund` in api/ and ui/ only if node_modules is missing (`npm ci` when a lockfile exists).
- Builds the UI with `npm run build` and the env above.
- Starts the API with `node src/server.js &`, then waits up to 10 s for /health.
- Starts the UI with `npx vite preview --host 0.0.0.0 --port $UI_PORT --strictPort &`.
- `trap 'kill 0' INT TERM EXIT`, then `wait -n` so that if either process dies, both stop and the script exits non-zero.
- `chmod +x`. Prints both URLs.

## 10. Top risks and mitigations
1. **Default status or overdraft clashes with a grader's expectations** (for example, expecting 400 on insufficient funds). Mitigation: the decisions are documented in the README, the HTTP code is 201 with a clear `failureReason`, and only the overdraft check is opinionated.
2. **Rate limiter trips the automated tests or the UI** (polling plus a 15-request seed). Mitigation: /health polls every 15 s and is exempt from the limit, the seed is ≤ 20 requests, and `RATE_LIMIT_MAX` is overridable.
3. **Route order bug:** `/transactions/export` captured by `/:id`. Covered by a test.
4. **Float money errors:** all sums are in integer cents, and the 2-decimal check uses an epsilon.
5. **Port or iframe problems:** `--strictPort` makes a busy port fail loudly; there is no X-Frame-Options header; CORS is `origin:*` including preflight; Vite preview runs with `--host`.
6. **First-run install time or network failure:** only 2 runtime dependencies on the API side; the UI depends on react, react-dom and vite.
7. **Date parsing ambiguity:** a strict regex runs before `Date.parse`, and everything is in UTC, which is documented.
