# AI Engineering Observatory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the TASKS.md banking API three times (Synergy, Codex solo, Opus solo), benchmark the three with real logged metrics and a hidden acceptance suite, and present it all in the Observatory web app.

**Architecture:** Three isolated variant folders built by AI runs; a stdlib-Python collector turns Codex/Claude JSONL logs + acceptance results into one `metrics.json`; a static React Observatory reads it and iframes the three live variant UIs.

**Tech Stack:** Python 3 + pytest + httpx (acceptance, collector; managed with `uv`); React + Vite + TypeScript + Tailwind + Recharts + Vitest (Observatory); Codex CLI 0.167.1; Claude Opus 5.5 subagents.

**Spec:** `homework-1/docs/superpowers/specs/2026-11-24-ai-observatory-design.md`

All paths below are relative to `homework-1/`.

## Global Constraints

- Run order: Synergy → Codex → Opus. Never parallel. Orchestrator never reads solo variants' code before all runs end.
- All builders effort **medium**. Opus = `model: "opus"`, `effort: "medium"`. Codex: `-c model_reasoning_effort=medium`, exact model recorded.
- Run cap 90 min, no retries, record as-is.
- Limit exhausted mid-run: user re-logins (possibly another account); pause interval excluded from duration; limit delta = sum of per-account deltas (snapshot before switch and after switch).
- Ports: API 3001/3002/3003, UI 5101/5102/5103 (codex/opus/synergy), Observatory 5100.
- Every UI number carries source label: `actual` | `estimated` | `manual`.
- Ranking weights: correctness 0.5, cost 0.2, time 0.2, limits 0.1; min–max normalized across variants.
- Hidden acceptance tests written only after all three runs, by a fresh subagent from TASKS.md only.
- No invented metrics: missing data = `null` → UI "n/a".

## Review Focus

1. A variant app not running → its tab shows "app not running — start with demo/run.sh", never a blank iframe. (Task 8 test)
2. A crashed run with no transcript/acceptance → collector emits `null` fields; UI shows "n/a", never `NaN`/`0`. (Task 6 + Task 7 tests)
3. Codex log has many cumulative `token_count` events → take the **last** `total_token_usage` per session, never sum events. (Task 6 test)
4. Claude JSONL repeats the same assistant `message.id` once per content block with identical `usage` → dedupe by `message.id`. (Task 6 test)
5. Pause intervals (re-login) → subtracted from `duration_s`, shown as `paused_s`. (Task 6 test)

---

## Shared data contracts

`benchmark/runs.json` (filled during Tasks 2–4, by the orchestrator):
```json
{"synergy": {"start": "ISO", "end": "ISO", "pauses": [["ISO","ISO"]],
  "codex_sessions": ["~/.codex/sessions/.../rollout-*.jsonl"],
  "claude_transcripts": ["~/.claude/projects/.../subagents/agent-*.jsonl"],
  "main_session": "~/.claude/projects/.../<session>.jsonl | null",
  "models": ["claude-opus-5-5", "<codex model>"]}, "codex": {...}, "opus": {...}}
```
`benchmark/limits.json` (typed from user's `/usage`): `{"<variant>": {"claude": [{"account": "A", "before_pct": 12, "after_pct": 31}], "note": "manual snapshot"}}`

`benchmark/prices.json`: `{"retrieved": "YYYY-MM-DD", "per_million_usd": {"<model>": {"input": n, "output": n, "cache_read": n, "cache_write": n}}, "sources": {"<model>": "url"}}`

`benchmark/results/acceptance.json`: `{"<variant>": {"passed": int, "total": int, "tests": [{"name": str, "passed": bool, "message": str|null}]} | null}`

`observatory/public/metrics.json` (collector output), per variant:
```
id, label, models[], app_url,
tokens {input, output, cache_read, cache_write, reasoning} | null   (source: actual)
duration_s, paused_s | null                                         (actual)
cost_usd | null                                                     (estimated)
limits {codex_pct, claude_pct} | null  + limits_source {codex: "actual", claude: "manual"}
acceptance {...} | null, code {loc, files, has_tests}, score 0..100 | null, rank
timeline [{t: seconds_from_start, kind: "read"|"write"|"command"|"test_fail"|"test_pass"|"message", label, tokens}]
debate {rounds: [{author, round, markdown}], decisions_md} | null
```
plus top-level `generated_at`, `weights`.

---

### Task 1: Preflight + BRIEF.md (gate: user approval)

**Files:** Create `experiment/BRIEF.md`, `experiment/PREFLIGHT.md`, `.gitignore` (root of homework-1: `node_modules/ .venv/ __pycache__/ dist/ .env *.log`), `variants/{synergy,codex,opus}/.gitkeep`, `benchmark/runs.json` (`{}`), `benchmark/limits.json` (`{}`).

- [ ] **Step 1:** Verify Codex headless with network: `codex exec -C /tmp/cx-probe -s workspace-write -c sandbox_workspace_write.network_access=true -c model_reasoning_effort=medium --skip-git-repo-check "run: curl -sI https://pypi.org | head -1 and report"` → expect `HTTP/2 200` in output and a new rollout file in `~/.codex/sessions`. Check whether the Codex plugin (`codex:codex-rescue`) can pass the same flags; if not, use direct `codex exec` and record why in `PREFLIGHT.md` with the exact command and the model name from the rollout file.
- [ ] **Step 2:** Write `BRIEF.md`: TASKS.md Tasks 1–4 verbatim; variant contract (spec §4: `run.sh`, `$API_PORT`/`$UI_PORT`, CORS, UI reads API URL from env, dark fintech UI elements list, README, own tests encouraged, mark demo data "DEMO"); minimum business rules (spec §4); rules: work only in `variants/<name>/`, don't read other `variants/*`, no questions — decide yourself, finish with `run.sh` working.
- [ ] **Step 3:** Show BRIEF.md to user. **Stop until approved.**
- [ ] **Step 4:** Commit `chore: add experiment brief and scaffolding`.

### Task 2: Synergy run

- [ ] **Step 1:** Ask user to run `/usage`, record `before_pct` in `limits.json`. Record `start` in `runs.json`.
- [ ] **Step 2 (plans):** In parallel — Opus subagent (`model: opus`, `effort: medium`): "read experiment/BRIEF.md, write variants/synergy/debate/plan-opus.md, don't write code"; Codex `codex exec ... -C variants/synergy` same task → `debate/plan-codex.md`.
- [ ] **Step 3 (critique, max 2 rounds):** each critiques the other's plan → `debate/round-<n>-<author>.md`. Stop early if no new disagreements.
- [ ] **Step 4:** Orchestrator writes `variants/synergy/DECISIONS.md` (decision | taken from | why) and implements per BRIEF; may delegate pieces to either (each delegation logged in DECISIONS.md, its session file added to `runs.json`).
- [ ] **Step 5:** Verify `API_PORT=3003 UI_PORT=5103 ./variants/synergy/run.sh` serves; `curl -s localhost:3003/transactions` → 200.
- [ ] **Step 6:** Record `end`, all session paths, `/usage` after. Commit `feat(synergy): synergy variant build`.

### Task 3: Codex solo run

- [ ] **Step 1:** `/usage` before; `start` in runs.json.
- [ ] **Step 2:** `codex exec -C variants/codex -s workspace-write -c sandbox_workspace_write.network_access=true -c model_reasoning_effort=medium --skip-git-repo-check "$(cat experiment/BRIEF.md) Your folder: variants/codex. Ports: API 3001, UI 5101."` with `run_in_background`; any question answered "decide yourself"; hard stop at 90 min.
- [ ] **Step 3:** Record `end`, rollout path, `/usage` after (Codex limit comes from log). Do **not** read the code. Commit `feat(codex): codex solo variant build`.

### Task 4: Opus solo run

- [ ] **Step 1:** `/usage` before; `start`.
- [ ] **Step 2:** Agent(`model: opus`, `effort: medium`, prompt = BRIEF.md + "Your folder: variants/opus. Ports: API 3002, UI 5102. Work autonomously to completion."). Hard stop at 90 min.
- [ ] **Step 3:** Record `end`, subagent transcript path (`~/.claude/projects/<proj>/<session>/subagents/agent-<id>.jsonl`), `/usage` after. Commit `feat(opus): opus solo variant build`.

### Task 5: Hidden acceptance suite + runner

**Files:** Create `benchmark/pyproject.toml` (deps: pytest, httpx), `benchmark/acceptance/conftest.py` (`base_url` fixture from env `BASE_URL`), `benchmark/acceptance/test_*.py`, `benchmark/run_acceptance.py`.

**Interfaces:** Produces `benchmark/results/acceptance.json` (contract above). CLI: `uv run python run_acceptance.py` — starts each variant's `run.sh` with its ports, waits ≤60 s for API, runs pytest with `--junitxml`, converts to JSON, stops the variant; unreachable variant → `null`.

- [ ] **Step 1:** Fresh subagent, given only TASKS.md + spec §5 tolerances, writes ~40 tests: create 201 + fields; list; get 404; each validation rule with TASKS.md error body shape (`error == "Validation failed"`, `details[].field`); balance after completed deposit/withdrawal/transfer; filters `accountId`, `type`, `from`/`to`, combined; Task-4 features probed and `pytest.skip` if endpoint returns 404 (not counted in `total`).
- [ ] **Step 2:** Run against all three; for every failure, orchestrator checks whether test or variant is wrong; fix only test bugs that contradict TASKS.md (log each in `benchmark/acceptance/CHANGELOG.md`).
- [ ] **Step 3:** Commit `test: add hidden acceptance suite and runner`.

### Task 6: Collector (TDD)

**Files:** `benchmark/collector/{codex_log.py,claude_log.py,timeline.py,score.py,code_stats.py,build.py}`, tests `benchmark/collector/tests/` with small JSONL fixtures.

**Interfaces:**
- `codex_tokens(path) -> dict | None` (last `total_token_usage`: input, cached_input→cache_read, output, reasoning)
- `codex_limit_delta(path) -> float | None` (last minus first `rate_limits.primary.used_percent`)
- `claude_tokens(paths, window: tuple[datetime, datetime] | None) -> dict | None` (dedupe by `message.id`; main session filtered to window)
- `active_seconds(start, end, pauses) -> tuple[int, int]` (duration_s, paused_s)
- `timeline(paths, start) -> list[dict]` (tool_use names → kind: Read→read, Write/Edit→write, Bash→command; Bash result containing failed/passed pytest/vitest summary → test_fail/test_pass)
- `cost(tokens_by_model, prices) -> float | None`
- `score(variants, weights) -> list[float | None]`
- `build.py` CLI: reads runs/limits/prices/acceptance + `variants/*`, writes `observatory/public/metrics.json`.

- [ ] **Step 1: failing tests:**
  - `test_codex_takes_last_cumulative_total` (fixture: 3 events, totals 10/30/50 → input 50)
  - `test_claude_dedupes_by_message_id` (2 lines same id, usage 100 → 100)
  - `test_claude_window_filters_main_session` (events outside window ignored)
  - `test_active_seconds_subtracts_pauses` (60 min run, 10 min pause → (3000, 600))
  - `test_missing_transcript_returns_none`
  - `test_score_minmax_lower_cost_better` (costs 1,2,3 all else equal → descending scores; all equal → equal)
  - `test_score_none_when_acceptance_missing`
  - `test_timeline_classifies_tools`
- [ ] **Step 2:** `cd benchmark && uv run pytest collector -q` → FAIL.
- [ ] **Step 3:** Implement. Stdlib only.
- [ ] **Step 4:** Fill `prices.json` from official pricing pages (Claude: claude-api skill; OpenAI pricing page for the Codex model), with `sources` URLs and date.
- [ ] **Step 5:** Tests PASS; run `uv run python -m collector.build` → valid `metrics.json` with 3 variants. Commit `feat: add metrics collector`.

### Task 7: Observatory — shell + Overview

**Files:** `observatory/` (Vite React TS), `src/types.ts` (mirrors metrics contract), `src/lib/format.ts` (`fmtTokens`, `fmtDuration`, `fmtUsd`, all returning `"n/a"` for null), `src/components/{SourceBadge,KpiCard,Tabs}.tsx`, `src/pages/Overview.tsx`, tests `src/__tests__/`.

- [ ] **Step 1: failing tests:** `format returns n/a for null`; `Overview renders three variants ranked by score` (fixture metrics); `every KPI shows a source badge`.
- [ ] **Step 2:** Implement: dark fintech/observability style (use frontend-design skill), tabs `Overview | Codex | Opus | Synergy` (hash routing), Overview = KPI cards (total tokens, total time, total $ est., best pass rate), ranking with weights, Recharts radar (correctness/cost/time/limits normalized), grouped bars tokens in/out/cache, time bars, comparison table, source legend; responsive to 390 px.
- [ ] **Step 3:** `npm test` PASS, `npm run build` OK. Commit `feat(observatory): overview`.

### Task 8: Observatory — variant tabs, replay, debate

**Files:** `src/pages/Variant.tsx`, `src/components/{AppFrame,Timeline,AcceptanceList,Debate}.tsx`.

- [ ] **Step 1: failing tests:** `AppFrame shows not-running state when probe fails` (mock fetch reject to `app_url`); `Timeline play advances cursor`; `Debate renders only for synergy`.
- [ ] **Step 2:** Implement: benchmark header; `AppFrame` probes `app_url` (no-cors fetch, 2 s timeout) then iframe or not-running card; acceptance per-test list; Timeline = horizontal track of events, click → detail (label, tokens), ▶ plays at 60× with pause; Debate shows rounds + DECISIONS.md (markdown via `react-markdown`).
- [ ] **Step 3:** Tests PASS, build OK. Commit `feat(observatory): variant tabs, replay, debate`.

### Task 9: Demo files + one-command run

**Files:** `demo/run.sh`, `demo/sample-requests.http`, `demo/sample-data.json`.

- [ ] **Step 1:** `run.sh`: checks ports 3001–3003, 5100–5103 free (else print which and exit 1), starts three variant `run.sh` with ports, builds collector output if missing, starts Observatory on 5100, traps Ctrl-C to kill all.
- [ ] **Step 2:** `sample-requests.http`: TASKS.md sample requests + each validation error + filters + Task-4 feature, against the winner's port. `sample-data.json`: ~15 transactions marked `"demo": true` in a wrapper.
- [ ] **Step 3:** Verify: `./demo/run.sh` → `curl localhost:5100` 200, all three iframes live. Commit `chore: add demo scripts`.

### Task 10: Docs, screenshots, PR

- [ ] **Step 1:** README.md (fill course template header; experiment, architecture diagram, results table from metrics.json, role of AI, own contribution), HOWTORUN.md (prereqs, `./demo/run.sh`, running tests, regenerating metrics).
- [ ] **Step 2:** Screenshots to `docs/screenshots/`: Overview, each tab, timeline, debate, curl requests/responses, API running, AI sessions (Codex/Claude prompts). Ask user for screenshots of their own Claude/Codex screens if needed.
- [ ] **Step 3:** Commit, `git push -u origin homework-1-submission`, `gh pr create --repo Tsybon/gen-ai-software-engineering-training --base main` with full description, 3–5 screenshots, TASKS.md link, test plan. Show user the PR before creating it.
