"""Shared helpers for reading agent JSONL logs."""
import json
import os
from collections.abc import Iterator
from datetime import datetime

Tokens = dict[str, int]
TOKEN_KEYS = ("input", "cache_read", "cache_write", "output", "reasoning")


def parse_ts(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def read_jsonl(paths: list[str]) -> Iterator[dict]:
    """Yields parsed rows of every existing file; malformed lines are skipped."""
    for path in paths:
        full = os.path.expanduser(path)
        if not os.path.exists(full):
            continue
        with open(full, encoding="utf-8") as fh:
            for line in fh:
                try:
                    yield json.loads(line)
                except json.JSONDecodeError:
                    continue


def any_exists(paths: list[str]) -> bool:
    return any(os.path.exists(os.path.expanduser(p)) for p in paths)


def add_tokens(total: dict[str, Tokens], model: str, delta: Tokens) -> None:
    bucket = total.setdefault(model, dict.fromkeys(TOKEN_KEYS, 0))
    for key in TOKEN_KEYS:
        bucket[key] += delta.get(key, 0)
