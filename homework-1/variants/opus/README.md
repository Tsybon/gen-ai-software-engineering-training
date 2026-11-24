# Ledgerline — Banking Transactions API + Web UI

A small banking transactions service (REST API, in-memory) with a dark fintech-style web UI.

## Run

```bash
./run.sh                                  # API on :3002, UI on :5102
API_PORT=4000 UI_PORT=4100 ./run.sh       # custom ports
API_BASE_URL=https://api.example ./run.sh # UI talks to another API
```

`run.sh` runs both servers in the foreground; Ctrl+C stops both. Requires Node.js >= 18 only —
there are **zero npm dependencies**, so there is nothing to install.

Tests: `cd api && node --test` (built-in `node:test` runner, exercises the HTTP API end to end).

## Stack

- **API**: Node.js `http` module, no framework (`api/app.js` holds all logic, `api/server.js` starts it).
- **UI**: vanilla HTML/CSS/JS (`ui/public`), served by a tiny static server (`ui/server.js`) that also
  serves `/config.js` with `apiBaseUrl` taken from `API_BASE_URL` (default `http://localhost:$API_PORT`).
- CORS `*` on every API response, preflight `OPTIONS` answered with 204. The UI sends no
  `X-Frame-Options`, so it can be embedded in an iframe.

## API

| Method | Endpoint | Notes |
|---|---|---|
| POST | `/transactions` | 201 with the created transaction; 400 `Validation failed` |
| GET | `/transactions` | filters: `accountId`, `type`, `from`, `to` (+ extra `status`), any combination |
| GET | `/transactions/:id` | 404 if unknown |
| GET | `/accounts/:accountId/balance` | `{ accountId, balances: [{ currency, balance }] }` |
| GET | `/accounts/:accountId/summary` | Feature A |
| GET | `/accounts/:accountId/interest?rate=0.05&days=30` | Feature B |
| GET | `/transactions/export?format=csv` | Feature C (accepts the same filters) |
| — | rate limiting | Feature D: 100 req/min per IP → 429 |
| GET | `/health` | liveness |

All four optional features (A–D) are implemented.

## Decisions (where the brief left room)

- **IDs**: UUID v4. **Timestamp**: set by the server at creation (client cannot backdate).
- **Accounts per type**: `deposit` needs `toAccount`, `withdrawal` needs `fromAccount`, `transfer` needs
  both and they must differ. The irrelevant side, if sent, is format-checked and then stored as `null`.
- **Account format**: `ACC-` + exactly 5 letters/digits, case-sensitive prefix (`^ACC-[A-Za-z0-9]{5}$`).
- **Amount**: must be a JSON number (strings like `"10"` are rejected), > 0, at most 2 decimals.
  No upper limit. Minor units are not currency-specific (JPY may also have 2 decimals).
- **Currency**: any ISO 4217 code known to the runtime (`Intl.supportedValuesOf('currency')`), uppercase only.
- **Status**: client may send `status` (`pending|completed|failed`); default `completed`. There is no endpoint
  to change status later — the brief has none, so pending transactions stay pending.
- **Overdrafts are not allowed**: a `completed` withdrawal/transfer exceeding the source balance in that
  currency is still stored (201) but with `status: "failed"` and `failureReason: "Insufficient funds"`.
  This keeps an audit trail and makes the "failed" KPI meaningful. Pending debits are not checked.
- **Balances**: per account per currency, only `completed` transactions count. Currencies with no completed
  activity are omitted. An account that never appeared in any transaction → 404; bad format → 400.
- **Date filters**: `from`/`to` accept ISO dates or datetimes; a date-only `to` is inclusive of that whole day (UTC).
  Invalid filter values → 400 with the standard validation shape.
- **Summary**: per currency; incoming money (deposits + incoming transfers) counts as deposits, outgoing
  (withdrawals + outgoing transfers) as withdrawals; completed only. `transactionCount` counts all statuses.
- **Interest**: simple interest `balance * rate * days / 365` per currency, negative balances yield 0, rounded to 2 decimals.
- **Rate limit**: fixed 60 s window per client IP, configurable via `RATE_LIMIT_PER_MINUTE` (default 100).
  Responses carry `X-RateLimit-Limit/Remaining`; 429 includes `Retry-After`. All routes count, except CORS preflight.
- **Errors**: unknown routes → 404 `{ "error": "Not found" }`; malformed JSON → 400 with the validation shape
  (`field: "body"`); unexpected errors → 500 and are logged.

## UI

KPI cards (count, completed volume per currency, pending, failed + failure rate), transactions table with
free-text search (client side) and account/type/status/date filters (server side), create form showing the
API's per-field errors under each field, details dialog, balances per currency (with account chips),
CSV export of the current filter, empty / no-match / API-unreachable states, responsive down to 390 px
(the table turns into cards).

**Sample data**: "Load sample data" posts 10 transactions through the API using accounts `ACC-DEMO1`…`ACC-DEMO4`.
Every transaction touching an `ACC-DEMO*` account is shown with a **DEMO** badge (table, details, balances),
so the label survives reloads without adding a non-spec field to the model.
