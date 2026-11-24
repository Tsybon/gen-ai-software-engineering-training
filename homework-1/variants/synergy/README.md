# Synergy variant — Ledger Console

Banking transactions API + web UI built by the **Synergy** setup: an Opus 5.5 planner and Codex planner debated the design (`debate/`), the orchestrator decided (`DECISIONS.md`) and implemented.

## Run

```bash
./run.sh                       # API → http://localhost:3003, UI → http://localhost:5103
API_PORT=4000 UI_PORT=4001 ./run.sh
```
Needs Node.js ≥ 20. First run installs dependencies and builds the UI. Ctrl-C stops both services.

## Stack
- **API:** Node 20+, Express 4, plain ESM JavaScript, in-memory store (`api/src`). Deps: `express`, `cors`.
- **UI:** React 18 + Vite, hand-written CSS tokens (`ui/src`).
- **Tests:** `cd api && npm test` — 50 contract tests (`node:test` + `supertest`).

## Endpoints
| Method | Path | Notes |
|---|---|---|
| POST | `/transactions` | 201 + record; 400 `{"error":"Validation failed","details":[…]}` |
| GET | `/transactions` | filters `accountId`, `type`, `from`, `to` (AND, inclusive, date-only `to` = whole UTC day), newest first |
| GET | `/transactions/:id` | 404 `{"error":"Transaction not found","details":[]}` |
| GET | `/accounts/:accountId/balance` | `{accountId, balances:{USD:125.5}}` |
| GET | `/accounts/:accountId/summary` | Task 4 A |
| GET | `/accounts/:accountId/interest?rate=0.05&days=30` | Task 4 B |
| GET | `/transactions/export?format=csv` | Task 4 C, same filters |
| — | rate limit 100 req/min/IP → 429 | Task 4 D (`RATE_LIMIT_MAX` env) |
| GET | `/health` | liveness |

## Business rules (see `DECISIONS.md` for the why)
- Status defaults to `completed`; client may send `pending`/`failed`. Only `completed` moves balances.
- deposit credits `toAccount`; withdrawal debits `fromAccount`; transfer does both (accounts must differ).
- Overdrafts are allowed (balance can go negative).
- Balances per account per currency, computed in integer cents; zero entries kept for currencies seen in history.
- Amount: JSON number, > 0, ≤ 2 decimals, ≤ 1 000 000 000. Account `ACC-XXXXX` (alphanumeric, case-sensitive). Currency: active ISO 4217 code, uppercase.
- Optional client `timestamp` (valid ISO 8601) is accepted; client `id` and unknown fields are ignored.
- Unknown query params ignored; repeated key → last value.

## UI
KPI cards (count, completed inflow/outflow per currency, failed), transactions table with search + server filters, create form with inline API errors, details drawer (`?transaction=<id>` deep link), account balances with summary and interest projection, empty / offline / invalid-filter states, CSV export, DEMO loader (records on `ACC-DEMO*` accounts, amber **DEMO** badge). Responsive down to 390 px.
