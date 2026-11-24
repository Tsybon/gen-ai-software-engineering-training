# Banking API — AI Engineering Observatory: Design

Date: 2026-11-24 · Branch: `homework-1-submission` · Repo: fork `Tsybon/gen-ai-software-engineering-training`, folder `homework-1/`

## 1. Intent

Homework #1 of the GenAI SE course (`homework-1/TASKS.md`): build a small banking REST API with AI help and document how AI helped. Course objective explicitly includes *"compare different AI tools' approaches to the same problem"*.

Instead of one plain API, we run a **controlled experiment**: the same task is built three times by three AI setups, then benchmarked with real, sourced numbers. The deliverable is a polished web app — **AI Engineering Observatory** — showing the comparison and embedding the three live apps.

Success at the defense: the reviewer sees in a few minutes (1) every TASKS.md requirement working, (2) an honest, data-backed answer to "which AI setup did it best, at what cost".

## 2. The experiment

| Variant | Who builds | Effort |
|---|---|---|
| **Codex** | Codex CLI alone, via the Codex plugin, fully autonomous | medium (recorded exact model) |
| **Opus** | One Claude Opus 5.5 subagent alone, fully autonomous | medium |
| **Synergy** | Opus 5.5 subagent (effort medium) and Codex debate the plan; main session (orchestrator) decides and implements | medium |

Rules (fairness):
- **Identical brief** for all three: `experiment/BRIEF.md` = TASKS.md + variant contract (§4) + short UI brief. User approves it before runs.
- **Sequential runs** Synergy → Codex → Opus (Synergy first so the orchestrator has seen no other variant's code). The orchestrator never reads solo variants' code until all runs finish. Never parallel (subscription limits are shared; parallel runs make limit/time attribution impossible).
- **No human help** during a run. If a variant asks a question, the reply is always "decide yourself".
- Each variant works only in its own folder `variants/<name>/`; it is told not to read sibling folders.
- Hidden acceptance tests (§5) are **written only after all three runs finish** (by a fresh subagent from TASKS.md alone), so no builder — including the Synergy orchestrator — has seen them.
- **Failure policy:** time cap 90 min per run; no retries; result recorded as-is (crash/partial = what the acceptance suite measures). If a subscription limit is hit mid-run, the user re-logins (possibly another account); the pause is excluded from time (marked in UI) and the limit delta is summed per account.
- **Equal permissions:** every builder gets network access (package installs) and write access only to its own folder. Codex: `codex exec --sandbox workspace-write` with network enabled, cwd = its folder. Opus subagent: same session permission mode, instructed to stay in its folder.
- Codex logs verified: `~/.codex/sessions/**/*.jsonl` contain `token_count` (input/cached/output/reasoning) and `rate_limits`.
- Synergy protocol: (1) Codex and Opus-debater each write a plan independently from BRIEF.md; (2) each critiques the other's plan, max 2 rounds; (3) orchestrator writes `variants/synergy/DECISIONS.md` (what was taken from whom and why) and implements; may delegate pieces to either. Debate transcript saved to `variants/synergy/debate/`.
- Synergy metrics = sum of Opus-debater + Codex + orchestrator tokens inside the synergy time window.

## 3. Metrics (all sourced; no invented numbers)

| Metric | Source | Label |
|---|---|---|
| Tokens input / output / cache read / cache write | Codex: `~/.codex/sessions/**/*.jsonl` (`token_count` events). Claude: subagent + main-session JSONL transcripts under `~/.claude/projects/<project>/` (`message.usage`), main session sliced by run time window | **actual** |
| Wall-clock time | first/last event timestamp of the run | **actual** |
| Cost USD | tokens × public list price per model (price table + date stored in `benchmark/prices.json`) | **estimated** |
| Subscription limit used | Codex: delta of `rate_limits.*.used_percent` in its log. Claude: `/usage` snapshot before/after each run, typed into `benchmark/limits.json` | Codex **actual**, Claude **manual snapshot** |
| Correctness | hidden acceptance suite pass rate | **actual** |
| Code stats | LOC, files, own tests present/passing | **actual** |

Every number in the UI shows its label (actual / estimated / manual) and source on hover. Demo data in any variant app must be visibly marked "DEMO".

No "beauty" score (removed by user).

**Overall ranking** (orchestrator's call, weights shown in UI): correctness 50%, cost 20%, time 20%, limits 10%. Each metric normalized min–max across the three variants.

## 4. Variant contract (in BRIEF.md)

Any stack allowed. Each variant must deliver in `variants/<name>/`:
- the 4 required endpoints + validation + filters per TASKS.md, error format exactly as TASKS.md example, plus at least one Task 4 feature;
- `run.sh` that starts API on `$API_PORT` and its own web UI on `$UI_PORT`; UI reads API base URL from env/config; API enables CORS (UI is embedded in an iframe of another origin);
- dark fintech-style UI: KPI cards, transactions table with filters, create-transaction form, transaction detail, balances by currency, clear empty states;
- `README.md` with its own decisions; own tests encouraged.

Fixed ports: Codex API 3001 / UI 5101, Opus 3002 / 5102, Synergy 3003 / 5103, Observatory 5100.

Business rules left to each variant (it's part of what's compared), but BRIEF states the minimum: balance is per account per currency; only `completed` transactions affect balance; deposit credits `toAccount`, withdrawal debits `fromAccount`, transfer does both.

## 5. Hidden acceptance suite

`benchmark/acceptance/` — pytest + httpx, black-box HTTP against `BASE_URL`. ~40 tests strictly from TASKS.md: create/list/get/404, status codes, each validation rule (amount sign, >2 decimals, ACC-XXXXX, ISO 4217, error body shape), balance after deposit/withdrawal/transfer, each filter and combinations, date range, the Task-4 feature the variant chose (detected; unimplemented optional features don't count against). Runner script runs the suite against all three, writes `benchmark/results/acceptance.json`.

Tolerances (orchestrator's call): `id` any string; `timestamp` any ISO 8601; extra fields allowed; status default for new transaction not asserted beyond being one of the 3 allowed values.

## 6. Observatory web app

`observatory/` — React + Vite + Tailwind + Recharts, static, reads `benchmark/results/metrics.json` (built by collector). No backend.

- **Overview**: KPI cards (total tokens, total time, total $ est., best pass rate), ranking with weights, radar chart (correctness, cost, time, limits per variant), grouped bars tokens in/out/cache, time bars, comparison table, source legend (actual / estimated / manual).
- **Codex / Opus / Synergy tabs**: benchmark header for that variant; live app in iframe (`localhost:510x`), with a friendly "app not running — start with demo/run.sh" state; report panel: key decisions, acceptance results per test, session timeline replayed from logs (tool calls over time); Synergy tab adds debate view and DECISIONS.md.
- Dark fintech/observability look, responsive.

## 7. Repo layout

```
homework-1/
  README.md  HOWTORUN.md  TASKS.md
  experiment/BRIEF.md
  variants/{codex,opus,synergy}/
  benchmark/{acceptance/,collector/,prices.json,limits.json,results/}
  observatory/
  demo/{run.sh,sample-requests.http,sample-data.json}
  docs/{screenshots/,superpowers/specs/}
```
`demo/run.sh` starts all three variants + observatory. `demo/sample-requests.http` targets the winning variant's port (course "main" API = benchmark winner).

## 8. Course deliverables

README (experiment, architecture, results, role of AI), HOWTORUN, `.gitignore`, screenshots (AI prompts/sessions, API running, curl requests/responses, observatory tabs), demo files, detailed PR into fork `main` with 3–5 screenshots and link to TASKS.md.

## 9. Goals / non-goals / anti-goals

- Goals: 100% TASKS.md in every variant attempt; honest comparison; one-command demo.
- Non-goals: database, auth, deployment, live telemetry backend, beauty score, rate limits of variants under real load.
- Anti-goals: any invented or unlabeled metric; variants seeing hidden tests or each other's code; shell polish delaying submission (order: runs → acceptance → collector → observatory → docs/PR).

## 10. Orchestrator calls (user may override)

Shared BRIEF; effort medium for all; ranking weights; ports; tests outside repo during runs; Codex invoked via plugin `codex exec`; synergy max 2 debate rounds; winner = course main API.

## 10a. User decisions

- No hard deadline: full scope kept, including session-timeline replay and Synergy debate view.
- User is present during runs: approves BRIEF.md before the first run; types `/usage` before and after each Claude run (orchestrator pauses and asks). Claude limit metric is kept.
- Session-timeline replay = per-variant timeline of steps parsed from logs (file reads/writes, commands, test fails/fixes) with per-step tokens, clickable points and an accelerated ▶ playback.

## 11. Left to the builder

Collector parsing details, chart choices, component structure, test tooling for observatory (one smoke test), exact acceptance test list within §5.
