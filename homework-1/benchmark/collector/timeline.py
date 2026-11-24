"""Step-by-step session timeline from Claude and Codex logs."""
import re

from .jsonl import parse_ts, read_jsonl

MAX_EVENTS = 400
CLAUDE_KINDS = {"Read": "read", "Grep": "read", "Glob": "read", "Write": "write", "Edit": "write",
                "NotebookEdit": "write", "Bash": "command", "Agent": "message", "Task": "message"}
FAIL_RE = re.compile(r"(?:# fail [1-9]\d*|\b[1-9]\d* failed\b|\bFAIL\b)")
PASS_RE = re.compile(r"(?:# pass \d+|\b\d+ passed\b|Tests?:\s+\d+ passed)")
WRITE_HINTS = ("apply_patch", "writeFile", "cat >", "tee ")


def _result_text(block: dict) -> str:
    content = block.get("content")
    if isinstance(content, list):
        return " ".join(c.get("text", "") for c in content if isinstance(c, dict))
    return str(content or "")


def _test_kind(text: str) -> str | None:
    if FAIL_RE.search(text):
        return "test_fail"
    if PASS_RE.search(text):
        return "test_pass"
    return None


def _claude_events(paths: list[str]) -> list[tuple[str, str, str, int | None]]:
    events, seen = [], set()
    for row in read_jsonl(paths):
        message = row.get("message") or {}
        content = message.get("content") if isinstance(message.get("content"), list) else []
        if row.get("type") == "assistant":
            # One message is logged once per content block: tokens go to its first line only, tool uses are deduped by id.
            first_line = message.get("id") not in seen
            seen.add(message.get("id"))
            tokens = (message.get("usage") or {}).get("output_tokens") if first_line else None
            for block in content:
                block_id = block.get("id")
                if block.get("type") == "tool_use" and (block_id is None and first_line or block_id not in seen):
                    seen.add(block_id)
                    name = block.get("name", "tool")
                    label = str((block.get("input") or {}).get("file_path") or (block.get("input") or {}).get("command") or name)
                    events.append((row["timestamp"], CLAUDE_KINDS.get(name, "command"), f"{name}: {label[:120]}", tokens))
        elif row.get("type") == "user":
            for block in content:
                kind = _test_kind(_result_text(block)) if block.get("type") == "tool_result" else None
                if kind:
                    events.append((row["timestamp"], kind, "test run", None))
    return events


def _codex_events(paths: list[str]) -> list[tuple[str, str, str, int | None]]:
    events, seen, last_tokens = [], set(), None
    for row in read_jsonl(paths):
        payload = row.get("payload") or {}
        if row.get("type") == "token_usage_record":
            last_tokens = (payload.get("usage") or {}).get("output_tokens")
            continue
        ptype = payload.get("type")
        key = payload.get("id") or payload.get("call_id")
        if ptype in ("custom_tool_call", "function_call") and key not in seen:
            seen.add(key)
            body = str(payload.get("input") or payload.get("arguments") or "")
            kind = "write" if any(h in body for h in WRITE_HINTS) else "message" if payload.get("name") in ("spawn_agent", "send_message", "followup_task") else "command"
            events.append((row["timestamp"], kind, f"{payload.get('name')}: {body[:120]}", last_tokens))
        elif ptype in ("custom_tool_call_output", "function_call_output") and (payload.get("call_id"), ptype) not in seen:
            seen.add((payload.get("call_id"), ptype))
            kind = _test_kind(str(payload.get("output") or ""))
            if kind:
                events.append((row["timestamp"], kind, "test run", None))
    return events


def timeline(claude_paths: list[str], codex_paths: list[str], start: str, end: str | None = None) -> list[dict]:
    """Events within [start, end], sorted; t = seconds since run start. Capped at MAX_EVENTS (evenly sampled)."""
    t0 = parse_ts(start)
    t1 = parse_ts(end) if end else None
    raw = sorted((e for e in _claude_events(claude_paths) + _codex_events(codex_paths)
                  if parse_ts(e[0]) >= t0 and (t1 is None or parse_ts(e[0]) <= t1)), key=lambda e: e[0])
    events = [{"t": max(0, int((parse_ts(ts) - t0).total_seconds())), "kind": kind, "label": label, "tokens": tokens}
              for ts, kind, label, tokens in raw]
    if len(events) > MAX_EVENTS:
        step = len(events) / MAX_EVENTS
        events = [events[int(i * step)] for i in range(MAX_EVENTS)]
    return events
