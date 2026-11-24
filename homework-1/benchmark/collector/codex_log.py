"""Token usage and rate-limit deltas from Codex CLI rollout logs (~/.codex/sessions)."""
from .jsonl import Tokens, add_tokens, any_exists, read_jsonl

DEFAULT_MODEL = "codex-unknown"


def codex_usage(paths: list[str]) -> dict[str, Tokens] | None:
    """Sums per-response `token_usage_record`s across sessions (sub-agents included), deduped by response_id.

    Codex `input_tokens` include cached tokens, so uncached input = input - cached.
    """
    if not any_exists(paths):
        return None
    total: dict[str, Tokens] = {}
    seen: set[str] = set()
    model = DEFAULT_MODEL
    for row in read_jsonl(paths):
        payload = row.get("payload") or {}
        if row.get("type") == "turn_context" and payload.get("model"):
            model = payload["model"]
        if row.get("type") != "token_usage_record" or payload.get("response_id") in seen:
            continue
        seen.add(payload.get("response_id"))
        usage = payload.get("usage") or {}
        cached = usage.get("cached_input_tokens", 0)
        add_tokens(total, model, {
            "input": usage.get("input_tokens", 0) - cached,
            "cache_read": cached,
            "cache_write": usage.get("cache_write_input_tokens", 0),
            "output": usage.get("output_tokens", 0),
            "reasoning": usage.get("reasoning_output_tokens", 0),
        })
    return total or None


def codex_limit_delta(paths: list[str]) -> dict[str, float] | None:
    """Percentage points of the 5 h (primary) and weekly (secondary) limit consumed during the run."""
    snapshots = []
    for row in read_jsonl(paths):
        payload = row.get("payload") or {}
        limits = payload.get("rate_limits") if payload.get("type") == "token_count" else None
        if limits and limits.get("primary") and limits.get("secondary"):
            snapshots.append((row["timestamp"], limits["primary"]["used_percent"], limits["secondary"]["used_percent"]))
    if not snapshots:
        return None
    snapshots.sort()
    first, last = snapshots[0], snapshots[-1]
    return {"primary": round(last[1] - first[1], 2), "secondary": round(last[2] - first[2], 2)}
