# Ledger — Banking Transactions API + Web UI

A complete in-memory transaction API with a responsive dark operations dashboard. Includes creation with field-level API errors, transaction details, combined account/type/date filters, text search, per-currency balances, KPI totals, CSV download and explicitly labelled DEMO records.

## Run

Requires **Node.js 22+**. No runtime dependencies, database, build step, account, API key or package download is needed.

```sh
./run.sh
```

- UI: http://localhost:5101
- API: http://localhost:3001
- Stop both with Ctrl+C. Restarting clears every transaction.
- Both servers run in one foreground process and bind `0.0.0.0`.

```sh
API_PORT=4001 UI_PORT=6101 ./run.sh
# For a browser accessing the API through a different hostname:
API_PORT=4001 UI_PORT=6101 API_BASE_URL=https://api.example.com ./run.sh
```

`API_PORT` defaults to `3001`; `UI_PORT` defaults to `5101`. `API_BASE_URL` defaults to `http://localhost:$API_PORT` and is delivered to the browser through `/config.js`. Set it to a browser-reachable HTTPS endpoint when embedding the UI on an HTTPS site. API CORS allows every origin, including preflight. The UI permits iframe embedding.

## API

JSON request and response bodies. Successful lists return a plain array; successful creation and lookup return a transaction object.

| Method | Path | Result |
|---|---|---|
| POST | `/transactions` | `201` created transaction; generated UUID and timestamp |
| GET | `/transactions` | `200` array, in creation order |
| GET | `/transactions/:id` | `200` transaction or `404` |
| GET | `/accounts/:accountId/balance` | `{accountId, balances: {USD: 125.5, EUR: 20}}` |
| GET | `/accounts/:accountId/summary` | `{accountId, totalDeposits: {USD: 125.5}, totalWithdrawals: {}, transactionCount: 1, mostRecentTransactionDate: "…"}` |
| GET | `/accounts/:accountId/interest?rate=0.05&days=30` | `{accountId, rate, days, balances: {...}, interest: {...}}` |
| GET | `/transactions/export?format=csv` | CSV attachment, including a `demo` column |
| GET | `/health` | `{status: "ok"}` |

Examples:

```sh
curl -s http://localhost:3001/transactions \
  -H 'Content-Type: application/json' \
  -d '{"toAccount":"ACC-12345","amount":1500.25,"currency":"USD","type":"deposit"}'

curl -s http://localhost:3001/transactions \
  -H 'Content-Type: application/json' \
  -d '{"fromAccount":"ACC-12345","toAccount":"ACC-ABCDE","amount":100,"currency":"USD","type":"transfer","status":"completed"}'

curl -s 'http://localhost:3001/transactions?accountId=ACC-12345&type=transfer&from=2026-01-01&to=2026-12-31'
curl -s http://localhost:3001/accounts/ACC-12345/balance
curl -s 'http://localhost:3001/accounts/ACC-12345/interest?rate=0.05&days=30'
curl -s 'http://localhost:3001/transactions/export?format=csv' -o transactions.csv
```

Validation returns `400`, exactly in this shape:

```json
{
  "error": "Validation failed",
  "details": [{"field": "amount", "message": "Amount must be a positive number"}]
}
```

Malformed JSON and invalid filters use that same shape. Unknown resources return `404`; unsupported methods `405`; bodies over 64 KiB `413`. No rate limiter is enabled; the three additional features implemented are summary, interest and CSV.

## Business decisions and assumptions

- New transactions default to `completed`. Optional `status` accepts only `pending`, `completed`, `failed`. There is no status mutation endpoint. Pending and failed entries remain in history but have no monetary effect.
- Deposit requires `toAccount`; withdrawal requires `fromAccount`; transfer requires both, and they must differ. A non-required account can be omitted or `""`; it is stored as `""`. If supplied, every account must match `^ACC-[A-Za-z0-9]{5}$`. Accounts are case sensitive and created implicitly. A supplied non-required account does not change deposit/withdrawal balance semantics.
- Overdrafts are allowed. No authentication, real bank integration, fees, FX conversion or persistence is implemented; this is a local course product.
- Amount must be a JSON number, positive and have at most two decimal places. Numeric strings, booleans and zero are rejected. The two-decimal rule applies uniformly, including JPY, as required by the task. Arithmetic uses integer hundredths with `BigInt` internally; JSON responses remain numbers.
- Individual amount and cumulative completed credits/debits per account/currency must each stay within `900719925474.09`. A rejected operation is not inserted and has no partial transfer effect. This conservative range preserves reliable numeric JSON totals. Cross-account aggregate UI volume is informational.
- Currency codes are uppercase, from the current ISO 4217 List One snapshot, including ISO special units/funds/metals. Retired and invented codes are rejected. The bundled [SIX currency list](https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml) was published on 2026-09-17; the exact source is saved in `api/iso4217.xml`. No network call is made during validation.
- `id` and `timestamp` are always generated by the API; supplied values and unknown fields are ignored. The optional boolean `demo` is retained only when true.
- Only completed records affect balances: deposit credits destination, withdrawal debits source, transfer does both. No currencies are added together. A valid account with no completed activity returns an empty `balances` object, representing zero in every currency.
- Summary deposit/withdrawal totals mean all completed inflows/outflows, including transfers. `transactionCount` and most recent date include all statuses and both account fields. No activity gives count `0` and date `null`.
- Simple interest is `balance × annualRate × days / 365`, per currency, rounded to two decimals, half away from zero. Negative balances yield negative interest. `rate` is a decimal from `0` to `1`; `days` is an integer from `0` to `36500`; both are required. Projections beyond the monetary range return `400`.
- Account, type and date filters are ANDed; account matches either account field. Dates accept `YYYY-MM-DD` or timezone-qualified ISO datetimes. Date-only boundaries are inclusive whole UTC days; datetimes are inclusive instants. Reversed or invalid ranges return `400`. UI timestamps use the browser's local timezone; date filters use UTC days.
- KPI totals cover the entire ledger; table filters affect history and CSV. Text search searches ID, accounts, currency and status locally; CSV uses the API account/type/date filters, not local text search. Completed volume counts each transaction once and never performs currency conversion. Multiple currencies show separate totals in the volume panel.
- Ledger starts empty. “Load demo data” adds eight records via the real API. Each has `demo: true`, a visible DEMO badge in history, a DEMO detail field and CSV marker. Demo entries affect the session balances like other entries. Loading is disabled once demo data is detected in the session.
- Product name, local-operator persona, typography and layout were chosen autonomously from the brief. No external design assets or invented business metrics are used. IBM Plex Sans is bundled under SIL OFL; see `public/fonts/OFL.txt`.

## Stack and layout

Node.js built-in `http`, `crypto` and filesystem APIs; vanilla JavaScript, semantic HTML and CSS. No runtime dependencies. `start.mjs` starts both servers, `api/domain.mjs` holds validation and ledger calculations, `api/server.mjs` handles HTTP, and `public/` contains the UI. The static server uses an explicit file whitelist.

## Verification

```sh
npm test                         # 12 API tests + run.sh contract test; no packages required
npm ci --cache .npm-cache         # optional test-only dependencies
npm run test:dom                  # UI DOM integration against a real isolated API
npm run test:all                  # all 14 executable non-browser tests
node --test --experimental-test-coverage test/api.test.mjs

# Optional real-browser suite; starts its own clean servers on 3101 / 5201:
PLAYWRIGHT_BROWSERS_PATH=.browsers npx playwright install chromium
PLAYWRIGHT_BROWSERS_PATH=.browsers npm run test:e2e
# Or use an already installed Chrome:
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e
```

Verified: all 14 non-browser tests pass. Coverage of backend domain code is 100% and HTTP server code is 89.69%. Tests exercise decimal arithmetic, every core route, validation/error shapes, combined UTC filters, CORS, summary, interest, CSV, malformed/oversized requests, overflow atomicity, custom ports and shutdown. DOM integration exercises API field errors, creation, details, search, filters, balances, DEMO labels, and network failure/recovery.

Browser verification limitation: Playwright suites are supplied, but this execution environment denies Chromium's macOS Mach-port registration (`Permission denied (1100)`) before a page opens. The connected browser and Orca alternatives were also unavailable. Actual screenshot/layout verification and browser end-to-end assertions could not run here. The UI includes 390px breakpoints, a contained horizontally scrolling table and keyboard/focus states; those layout claims still need a real browser check outside this sandbox.
