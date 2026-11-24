"""Token usage from Claude Code JSONL transcripts (~/.claude/projects/...)."""
from datetime import datetime

from .jsonl import Tokens, add_tokens, any_exists, parse_ts, read_jsonl


def in_window(ts: str, window: tuple[datetime, datetime] | None) -> bool:
    return window is None or window[0] <= parse_ts(ts) <= window[1]


def claude_usage(paths: list[str], window: tuple[datetime, datetime] | None = None) -> dict[str, Tokens] | None:
    """Sums assistant `message.usage`, deduped by `message.id` (one message is logged once per content block)."""
    if not any_exists(paths):
        return None
    total: dict[str, Tokens] = {}
    seen: set[str] = set()
    for row in read_jsonl(paths):
        message = row.get("message") or {}
        if row.get("type") != "assistant" or message.get("id") in seen or not in_window(row["timestamp"], window):
            continue
        seen.add(message.get("id"))
        usage = message.get("usage") or {}
        add_tokens(total, message.get("model", "claude-unknown"), {
            "input": usage.get("input_tokens", 0),
            "cache_read": usage.get("cache_read_input_tokens", 0),
            "cache_write": usage.get("cache_creation_input_tokens", 0),
            "output": usage.get("output_tokens", 0),
        })
    return total or None
