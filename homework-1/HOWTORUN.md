# ▶️ How to run

## Prerequisites
- **Node.js 20+** and npm (all three apps and the Observatory)
- **Python 3.11+** and [`uv`](https://docs.astral.sh/uv/) (only to re-run the acceptance suite or rebuild metrics)
- Free ports 3001–3003 and 5100–5103

## 1. Everything with one command

```bash
cd homework-1
./demo/run.sh
```
The first run installs dependencies and builds each UI (a few minutes). When it prints `Open http://localhost:5100`, open:

| URL | What |
|---|---|
| http://localhost:5100 | **AI Engineering Observatory**: overview, then the Codex / Opus / Synergy tabs |
| http://localhost:5101 · :3001 | Codex build: UI · API |
| http://localhost:5102 · :3002 | Opus build: UI · API |
| http://localhost:5103 · :3003 | Synergy build: UI · API |

`Ctrl-C` stops everything. Logs go to `demo/.logs/`.

## 2. One build only

```bash
./variants/synergy/run.sh                    # API :3003, UI :5103
API_PORT=4000 UI_PORT=4001 ./variants/opus/run.sh
```

## 3. Try the API

- Open `demo/sample-requests.http` in VS Code (REST Client) or a JetBrains IDE and run requests one by one. It targets the Opus build; change `@host` to compare.
- Or with curl:
  ```bash
  curl -X POST http://localhost:3003/transactions -H "Content-Type: application/json" \
    -d '{"fromAccount":"ACC-12345","toAccount":"ACC-67890","amount":100.50,"currency":"USD","type":"transfer"}'
  curl "http://localhost:3003/transactions?accountId=ACC-12345"
  curl http://localhost:3003/accounts/ACC-12345/balance
  ```
- Each UI also has a **Load DEMO data** button. Every record it creates is labelled DEMO.

## 4. Demo flow for the defense
1. `./demo/run.sh`, open http://localhost:5100.
2. **Synergy** tab → in the embedded app, create a deposit to `ACC-12345`, then a withdrawal.
3. Look up `ACC-12345` in the Accounts panel → the balance changed.
4. Find the request in the API: `curl http://localhost:3003/transactions?accountId=ACC-12345`.
5. **Overview** → explain the race, the score, and where each number comes from (`actual` / `estimated` / `manual` badges, hover for details).

## 5. Tests

```bash
cd variants/synergy/api && npm test                 # 50 API contract tests (Synergy build)
cd benchmark && uvx pytest collector -q             # 15 collector tests
cd observatory && npx vitest run                    # 9 Observatory tests
cd benchmark && uv run python run_acceptance.py     # hidden suite against all three builds (starts them itself, ~3 min each)
```

## 6. Rebuild the metrics

```bash
cd benchmark
uv run python run_acceptance.py      # → results/acceptance.json
python3 -m collector.build           # → observatory/public/metrics.json
```
The collector reads the session logs listed in `benchmark/runs.json` (under `~/.codex/sessions` and `~/.claude/projects`). On another machine those files don't exist, so the committed `metrics.json` is what the Observatory shows.
