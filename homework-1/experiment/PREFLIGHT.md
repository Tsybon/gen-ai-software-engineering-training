# Preflight (2026-11-24)

## Codex
- CLI: `codex-cli 0.167.1`, model from rollout log: `gpt-6.1-sol`, reasoning effort `medium`, plan `plus`.
- Headless command used for every Codex run:
  ```
  codex exec -C <variant dir> -s workspace-write \
    -c sandbox_workspace_write.network_access=true \
    -c model_reasoning_effort=medium --skip-git-repo-check "<prompt>"
  ```
- Network probe: `curl -sI https://pypi.org` → `HTTP/2 200` inside sandbox.
- Logs: `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`, `event_msg` / `token_count` events carry cumulative
  `total_token_usage` (input includes cached) and `rate_limits.primary` (5 h window) / `secondary` (weekly).
- Limit state at preflight: primary 22 %, **secondary (weekly) 91 %** → re-login likely needed mid-experiment.
- Why direct CLI, not the `codex:codex-rescue` plugin agent: the plugin is a wrapper over the same CLI; the
  direct call pins sandbox, network and effort flags explicitly, so all Codex runs are launched identically.

## Claude
- Model `claude-opus-5-5` via Agent tool, `effort: medium`.
- Logs: `~/.claude/projects/<project>/<session>.jsonl` (main session) and
  `<session>/subagents/agent-<id>.jsonl` (subagents); `message.usage` per assistant message.
- Limit: manual `/usage` snapshots by the user, recorded in `benchmark/limits.json`.

## Shared environment
- Both tools load the user's global agent instructions (e.g. reply prefix) — identical for all variants.
- Python 3.15, Node (system), `uv` available.
