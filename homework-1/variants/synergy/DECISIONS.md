# Synergy — orchestrator decisions

Inputs: `debate/plan-opus.md`, `debate/plan-codex.md`, `debate/round-1-opus.md`, `debate/round-1-codex.md`.
Round 2 skipped: after round 1 both sides had produced resolution tables; the remaining conflicts were policy choices with no new arguments, so the orchestrator decided them.

| # | Decision | Taken from | Why |
|---|---|---|---|
| 1 | API: Node ≥20, Express 4, plain ESM JS, deps `express` + `cors` only | Opus (Codex conceded) | Fewer moving parts in `run.sh` first install; no build step |
| 2 | Hand-written validators collecting **all** errors into the exact brief envelope | Opus | Exact control of error shape without Zod |
| 3 | Amount: JSON number, finite, > 0, ≤ 1 000 000 000, scale checked on `String(amount)` with `^\d+(\.\d{1,2})?$` (exponent forms rejected) | Codex goal + Opus no-dep implementation | Exact decimal check, no epsilon, no silent rounding, no `decimal.js` |
| 4 | Money summed in integer cents | both | No float drift |
| 5 | **Overdraft allowed** (balance may go negative), documented | Codex (Opus conceded) | Never surprises a client that POSTs `completed` with a `failed` record |
| 6 | `status` optional, default `completed`; client may set pending/failed | both | Grader creates deposit → sees balance immediately |
| 7 | Unknown body fields and a client `id` are **ignored** | Opus | A client posting the full model must not get 400 |
| 8 | Optional client `timestamp` accepted if valid ISO 8601, else 400; default server time | Opus | Enables spread-out DEMO data and meaningful date-filter demos |
| 9 | Required accounts: deposit → `toAccount`; withdrawal → `fromAccount`; transfer → both, must differ. The unused side is optional, format-checked if present, stored, ignored for balance | Opus | Clients often send both sides; rejecting them is a grader risk |
| 10 | Account regex `^ACC-[A-Za-z0-9]{5}$`, case-sensitive, no trimming | both | |
| 11 | Currency: frozen active ISO 4217 List One alphabetic codes incl. funds/metals, minus `XTS`/`XXX`; uppercase only | Codex (Opus conceded) | Sourced list; no hidden normalisation |
| 12 | Unknown query params ignored; repeated key → last value wins; known params validated (400 on bad accountId/type/date, reversed range) | Opus | Harmless GETs never fail on cache-busters |
| 13 | Dates: `YYYY-MM-DD` or ISO datetime; inclusive both ends; date-only `to` = whole UTC day | both | |
| 14 | Balance: `{accountId, balances: {USD: 125.5}}`, zero entries kept for every currency seen in the account's history | Codex | Easy to read; UI shows "0.00" instead of nothing |
| 15 | Summary: `{accountId, totalDeposits:{CUR}, totalWithdrawals:{CUR}, transactionCount, mostRecentTransactionDate}`; credits = deposits + incoming transfers, debits = withdrawals + outgoing transfers (completed only); count + date over all statuses | Opus field names, Codex semantics | Names mirror TASKS.md wording |
| 16 | Errors: 404 `{"error":"Transaction not found","details":[]}`, 429 `{"error":"Too many requests","details":[]}`, 500 same envelope | Codex | No invented `details` entries |
| 17 | All four Task-4 extras; A first | both | |
| 18 | Rate limit 100/min/IP fixed window, `RATE_LIMIT_MAX` env override, OPTIONS + `/health` exempt, `Retry-After` | both | |
| 19 | UI: Vite + React + hand-written CSS tokens, single page + details drawer + Accounts panel, `?transaction=<id>` deep link | Opus layout + Codex deep link | |
| 20 | KPIs: count, completed inflow/outflow per currency (all currencies listed, never summed across currencies), failed count; transfers not double-counted | Codex | |
| 21 | DEMO loader: ≤ 20 requests, accounts `ACC-DEMO1..3`, amber DEMO badge, refuses duplicate load | Opus + Codex guard | Brief invites it; grader sees populated UI |
| 22 | `VITE_API_BASE_URL`, defaulted by `run.sh` from `API_PORT` | Codex name | |
| 23 | `run.sh`: early trap, tracked child PIDs, portable supervision loop (macOS bash 3.2 has no `wait -n`), readiness for both API `/health` and UI, install when `node_modules` missing | Codex lifecycle + Opus install trigger | |
| 24 | Tests: exhaustive API contract tests (`node:test` + `supertest`); UI verified by production build + run.sh smoke | Opus | Effort goes to the part that must be 100% |
