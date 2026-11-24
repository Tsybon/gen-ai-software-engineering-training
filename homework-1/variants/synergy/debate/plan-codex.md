# Codex proposal — banking transactions

## Scope and stack
- Source of truth: `../../experiment/BRIEF.md`; implement only in `variants/synergy`.
- TypeScript throughout; Node.js 22+, Express 5, Zod, React, Vite, plain CSS, Lucide icons.
- One npm workspace and lockfile; `tsx` for API execution; Vitest, Supertest, Testing Library, Playwright for tests.
- Express makes HTTP behavior explicit; React handles responsive workflows; shared schemas prevent API/UI drift.
- Prefer this over Next.js (unneeded server rendering) or Python + React (two dependency ecosystems).
- No database, authentication, external banking integration, FX conversion, background jobs, or persistence.

## Folder structure
- `package.json`, `package-lock.json`, `tsconfig.base.json`: workspace, pinned dependencies, scripts.
- `run.sh`, `README.md`, `.env.example`, `.gitignore`: launch contract and documented decisions.
- `shared/src/{contracts,validation,currencies,money}.ts`: DTOs, schemas, frozen currency codes, cent arithmetic.
- `api/src/{app,server,config}.ts`: injectable app factory, listener, environment validation.
- `api/src/transactions/{store,service,routes}.ts`: memory ownership, atomic business operations, HTTP adapters.
- `api/src/accounts/{service,routes}.ts`: balance, summary, interest projections.
- `api/src/http/{errors,rate-limit,csv}.ts`: stable errors, limiter, export serialization.
- `api/test/`: isolated unit and Supertest contract tests.
- `ui/src/{App,api,styles}.tsx` (styles is `.css`): shell, typed fetch wrapper, tokens and responsive rules.
- `ui/src/components/`: KpiCards, Filters, TransactionTable, TransactionCards, CreateTransactionDialog, TransactionDetailsDrawer, AccountPanel, ErrorState.
- `ui/test/`, `e2e/`: component and browser scenarios; `debate/` contains planning artifacts only.

## Data model and business decisions
- Public transaction fields: `id`, `fromAccount`, `toAccount`, `amount`, `currency`, `type`, `timestamp`, `status`.
- UUID v4 ID and UTC ISO timestamp are server-generated; clients cannot override either.
- Internally store immutable records with integer `amountCents`; expose `amount` as a JSON number.
- Input `status` is optional: default `completed`; explicitly accept `pending`, `completed`, `failed` for testing and inspection.
- Transactions are append-only; there is no update/delete or automatic status transition endpoint.
- Deposit requires `toAccount`; withdrawal requires `fromAccount`; transfer requires both, and they must differ.
- The unused account field may be omitted or null; serialize it as null; reject a non-null unused account to avoid ambiguity.
- Accounts must match `^ACC-[A-Za-z0-9]{5}$`; case-sensitive identity; no trimming or silent normalization.
- Accounts are implicit: references in any accepted record register them; no separate account creation endpoint.
- A syntactically valid unseen account has zero balance and empty summary (200); malformed account IDs return 400.
- Allow overdrafts. A completed withdrawal/transfer may make an account negative; document this educational ledger policy prominently.
- Only completed records affect balances: deposit credits destination, withdrawal debits source, transfer does both atomically.
- Balance is per account AND currency; retain zero entries for currencies appearing in that account's history, including pending/failed.
- No aggregate money total across currencies; all KPI totals, account totals and interest are grouped by currency.
- Use cent units for every currency, including JPY, following the explicit two-decimal course rule rather than currency minor-unit rules.
- Amount must be finite, numeric, greater than zero, at most two decimal places, and at most 1,000,000,000.00.
- Validate decimal scale with decimal arithmetic (`decimal.js`); do not use floating-point remainder checks or silently round input.
- Check every resulting cent balance/aggregate stays a safe integer before committing; otherwise reject the entire operation with 400.
- Store only in process memory; restart resets records, accounts and limiter; start empty, with no automatic sample data.
- No sample-data feature in the first release, avoiding unlabeled artificial records and partial seed failures.
- Currency validation: frozen active ISO 4217 alphabetic codes from SIX's official List One XML, checked into `shared/src/currencies.ts`.
- Record retrieval date/source URL in that file and README; no runtime download; exclude withdrawn codes and non-currency placeholders XTS/XXX.
- Accept uppercase codes only; include active fund/metal codes listed by SIX; reject merely plausible three-letter strings.

## API contract and validation
- `POST /transactions`: 201 plus the created object; `GET /transactions`: 200 plus a bare array.
- `GET /transactions/:id`: 200 object or 404; an unknown/non-UUID transaction ID also returns 404.
- `GET /accounts/:accountId/balance`: 200 `{accountId, balances: {USD: 125.50, EUR: -20}}`; unseen account uses `{}`.
- List order: timestamp descending, then insertion sequence descending; no pagination or hidden result cap.
- `accountId` matches either account field; `type` matches exactly; all supplied filters combine with AND.
- `from`/`to` accept real calendar `YYYY-MM-DD` dates or strict ISO datetimes containing a timezone; reject invalid dates.
- Date-only `from` includes UTC midnight; date-only `to` includes the entire UTC day, implemented as next-day exclusive.
- Datetime bounds are inclusive instants; normalize offsets to UTC; reject reversed effective ranges and repeated query keys.
- Reject unknown POST properties and unknown list/export query parameters; empty values are invalid, absent values mean no filter.
- Zod schemas validate both body and query; collect every independent error in deterministic schema-field order.
- Every 400 validation response has exactly this envelope, without extra keys:
  `{"error":"Validation failed","details":[{"field":"amount","message":"Amount must be a positive number"},{"field":"currency","message":"Invalid currency code"}]}`
- Other fixed amount messages: `Amount must have at most 2 decimal places`, `Amount must not exceed 1000000000`.
- Field names use body/query names; cross-field errors attach to `toAccount`, `to`, or `amount`, as applicable.
- Missing required account: `Account is required for this transaction type`; malformed: `Account must match ACC-XXXXX`.
- Malformed JSON: 400 `{"error":"Validation failed","details":[{"field":"body","message":"Invalid JSON"}]}`.
- Other errors retain `{error,details}`: 404 `{"error":"Transaction not found","details":[]}`, unknown route uses `Not found`.
- Unexpected exceptions: 500 `{"error":"Internal server error","details":[]}`; log diagnostic details server-side only.
- JSON body limit 16 KiB; oversize requests return 413 in the same envelope with `Request body too large`.
- CORS: `Access-Control-Allow-Origin: *`, no credentials; handle OPTIONS before the limiter; accept JSON Content-Type.

## Task 4: deliver A, B, C and D
- A: `/accounts/:accountId/summary` returns `{accountId, totalsByCurrency, transactionCount, lastTransactionAt}`.
- Each currency entry contains `{totalDeposits,totalWithdrawals}`; completed inbound transfers count as deposits, outbound as withdrawals.
- Count all statuses once per involved record; latest timestamp includes every status; unseen account yields `{}`, 0, null.
- B: `/accounts/:accountId/interest?rate=0.05&days=30` returns `{accountId,rate,days,interestByCurrency}`.
- Require finite decimal annual rate in [0,1] and integer days in [0,36500]; both required; actual/365 simple interest.
- Formula per currency: balance × rate × days / 365, rounded half-up to two decimals only in the response; negative balances yield negative interest.
- Interest is a read-only projection; it never posts a transaction; reject results outside safe cent range.
- C: `/transactions/export?format=csv` accepts the same filters; require `format=csv`; register before `/:id`.
- UTF-8 CSV with CRLF, fixed header `id,fromAccount,toAccount,amount,currency,type,timestamp,status`, two-decimal amounts, empty nulls.
- Use RFC 4180 quoting; fixed filename `transactions.csv`, Content-Disposition attachment; browser downloads a fetched Blob.
- D: fixed 60-second per-IP windows, maximum 100 API requests; the 101st returns 429 `{error:"Too many requests",details:[]}` and Retry-After seconds.
- Count invalid requests too; exempt OPTIONS and `/health`; disable proxy trust; expire idle limiter entries; inject clock/store for tests.

## UI and design direction
- One application shell with `/transactions` and `/accounts`; `/` redirects to transactions; direct links receive SPA fallback.
- Dark operations console: near-black navy background, slate panels, restrained cyan accent, green/amber/red status chips with text labels.
- System sans-serif, tabular numeric amounts, monospace account IDs; 8 px spacing rhythm, thin borders, modest corners, no decorative charts.
- Desktop: compact navigation rail, title/action row, four KPI cards, filter toolbar, ledger table, contextual details drawer.
- KPIs reflect server-filtered records: transaction count, completed inflow, completed outflow, failed count; monetary cards show separate currency lines.
- Ledger-wide inflow counts deposits; outflow counts withdrawals; transfers get their own currency totals below, never double-counted as external flow.
- Account-scoped KPIs use account-relative completed credits/debits, including transfers; label scope explicitly.
- Server filters: account, type, date range; local search over returned ID/accounts/currency/status, labelled as searching loaded results.
- Summary cards reflect server filters before local search; show visible/loaded counts when search narrows the table.
- Creation dialog dynamically reveals accounts by type; default completed with optional status selector; retain values after API validation failure.
- Inline field messages plus error summary; disable duplicate submission; success refreshes ledger, KPIs and selected account projections.
- Details drawer shows all public fields, status and currency; navigable via `?transaction=<id>`; handles stale/missing IDs.
- Account page: account entry, currency balance cards, summary counts/totals and optional interest calculator.
- At 390 px: collapsed navigation, stacked KPIs/filters, ledger cards, full-screen dialogs; no page-level horizontal overflow.
- Keyboard focus management, Escape dismissal, labelled inputs, visible focus, reduced-motion support and accessible status announcements.
- Loading skeletons, useful empty-state create action, filter-reset action, retryable network errors; never present request failure as an empty ledger.
- UI uses `VITE_API_BASE_URL`, default supplied by launcher as `http://localhost:${API_PORT}`; no hardcoded 3003 in fetch calls.

## Testing and implementation sequence
- First pin schemas and money rules with Vitest, then build service/store, routes, UI, launch script and README; tests precede implementation.
- Unit coverage: all type/account/status permutations, fractional amounts, unsafe totals, currencies, strict dates, bounds and rounding; target ≥80% coverage.
- Supertest with fresh app/store/clock per test: every endpoint/status/envelope, combined filters, midnight/offset boundaries, CORS, CSV routing/escaping.
- Prove pending/failed exclusion, independent currencies, negative balances, transfer conservation and no partial writes on rejection.
- Verify limiter requests 100/101, expiry, IP isolation and OPTIONS exemptions with injected time; no real-time sleeps.
- Component tests prove conditional accounts, retained values, server field errors, currency formatting and API-unreachable retry.
- Playwright: deposit → transfer → withdrawal → inspect balances; filters, detail link, invalid form, CSV download, keyboard flow and 390 px viewport.
- Final checks: typecheck, tests, production build, then `run.sh` smoke tests using default AND overridden ports; stop signals must release both ports.

## run.sh contract
- Executable Bash entry point; resolve/cd to its own directory; use strict mode; default/export API_PORT=3003 and UI_PORT=5103.
- Validate distinct integer ports 1–65535 and available Node/npm; never kill an unrelated process to free a port.
- Install via `npm ci` on first run or lockfile change; fail clearly if install fails; build shared/UI assets on each launch.
- Set default VITE_API_BASE_URL before UI build while honoring explicit override; API/UI bind 0.0.0.0; Vite preview uses strictPort.
- Start both managed children, keep the shell waiting in foreground; print addresses after API `/health` and UI readiness succeed within 30 seconds.
- Trap INT/TERM/EXIT, terminate/reap both children; any child exit before shutdown stops its sibling and exits nonzero; no orphan listeners.

## Top risks
- Frozen ISO data can age: preserve provenance and update deliberately; confirm dataset against official SIX source during implementation.
- Two-decimal JPY and allowed overdrafts differ from real banking: explicit README/UI guidance and contract tests prevent accidental policy changes.
- Client-supplied terminal status is intentionally educational; no authorization or real-money guarantees are implied.
- Memory-only storage and unbounded history limit scale; document restart loss, avoid unnecessary polling, preserve required full-list contract.
- Decimal conversion, date boundaries, static `/export` routing and sibling-process cleanup are highest-risk integration seams; test them directly.
- Localhost API defaults assume local iframe access; remote deployment must configure the reachable API base URL before build.
