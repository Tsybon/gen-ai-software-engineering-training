# BRIEF — Banking Transactions API + Web UI

You are building a complete, working product **autonomously**. Nobody will answer questions: whenever something is unclear, decide yourself, note the decision in your README, and keep going. Finish only when `run.sh` starts a working API and UI.

## Workspace rules
- Work **only** inside your assigned folder (given at the end of this brief). Create everything there.
- Do **not** read, copy or open anything in other `variants/*` folders or in `benchmark/`.
- Any language, framework and libraries are allowed. You may install packages.

## Part 1 — Course task (must be 100% done)

### Task 1: Core API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/transactions` | Create a new transaction |
| `GET` | `/transactions` | List all transactions |
| `GET` | `/transactions/:id` | Get a specific transaction by ID |
| `GET` | `/accounts/:accountId/balance` | Get account balance |

Transaction model:
```json
{
  "id": "string (auto-generated)",
  "fromAccount": "string",
  "toAccount": "string",
  "amount": "number",
  "currency": "string (ISO 4217: USD, EUR, GBP, etc.)",
  "type": "string (deposit | withdrawal | transfer)",
  "timestamp": "ISO 8601 datetime",
  "status": "string (pending | completed | failed)"
}
```
- In-memory storage only (no database).
- Amounts must be positive numbers.
- Return appropriate HTTP status codes (200, 201, 400, 404).
- Basic error handling.

### Task 2: Validation
- **Amount**: positive, maximum 2 decimal places.
- **Account**: format `ACC-XXXXX` (X = alphanumeric).
- **Currency**: valid ISO 4217 codes only (USD, EUR, GBP, JPY, …).
- Meaningful errors, in exactly this shape:
```json
{
  "error": "Validation failed",
  "details": [
    {"field": "amount", "message": "Amount must be a positive number"},
    {"field": "currency", "message": "Invalid currency code"}
  ]
}
```

### Task 3: Transaction history filters on `GET /transactions`
- `?accountId=ACC-12345`
- `?type=transfer`
- `?from=2024-01-01&to=2024-01-31`
- Any combination of the above.

### Task 4: Additional features (at least one; more is welcome)
- A) `GET /accounts/:accountId/summary` → total deposits, total withdrawals, number of transactions, most recent transaction date.
- B) `GET /accounts/:accountId/interest?rate=0.05&days=30` → simple interest on current balance.
- C) `GET /transactions/export?format=csv` → CSV export.
- D) Rate limiting: max 100 requests/minute per IP → `429 Too Many Requests`.

### Minimum business rules
- Balance is per account **per currency**.
- Only `completed` transactions affect balances.
- `deposit` credits `toAccount`; `withdrawal` debits `fromAccount`; `transfer` debits `fromAccount` and credits `toAccount`.
- Everything else (e.g. initial status, overdrafts, which account fields are required per type) is your decision — document it.

## Part 2 — Run contract (required, the product is tested automatically through it)
- `run.sh` in your folder root, executable, starts **both** the API and the web UI in the foreground and installs whatever it needs on first run.
- API listens on `$API_PORT`; UI is served on `$UI_PORT` (both env vars, use the defaults given below if unset).
- The UI reads the API base URL from configuration/env (default `http://localhost:$API_PORT`).
- The API enables CORS for any origin (the UI will be embedded in an iframe of another site).
- `README.md` in your folder: what you built, stack, decisions, how to run. Tests of your own are encouraged.

## Part 3 — Web UI
A polished, modern web app over the API, dark fintech / observability style, responsive (works at 390 px width):
- KPI cards: number of transactions, totals, failed count.
- Transactions table with search and filters (account, type, date range).
- Create-transaction form with clear validation errors from the API.
- Transaction details view.
- Account balances by currency.
- Clear empty states and error states (e.g. API unreachable).
- If you add a "load sample data" button, every sample record must be visibly labelled **DEMO**.

---
