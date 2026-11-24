import json
from datetime import datetime, timezone

from collector.claude_log import claude_usage
from collector.codex_log import codex_usage, codex_limit_delta
from collector.metrics import active_seconds, cost, score
from collector.timeline import timeline
from collector.code_stats import code_stats


def ts(minute, second=0):
    return f"2026-11-24T20:{minute:02d}:{second:02d}.000Z"


def write_jsonl(path, rows):
    path.write_text("\n".join(json.dumps(r) for r in rows) + "\n")
    return str(path)


def codex_record(minute, rid, inp, cached, out, reasoning=0):
    return {"timestamp": ts(minute), "type": "token_usage_record",
            "payload": {"response_id": rid, "usage": {"input_tokens": inp, "cached_input_tokens": cached,
                                                      "output_tokens": out, "reasoning_output_tokens": reasoning}}}


def codex_limits(minute, primary, secondary):
    return {"timestamp": ts(minute), "type": "event_msg",
            "payload": {"type": "token_count", "info": None,
                        "rate_limits": {"primary": {"used_percent": primary}, "secondary": {"used_percent": secondary}}}}


def claude_msg(minute, mid, model="claude-opus-5-5", out=10, tools=()):
    content = [{"type": "tool_use", "name": n, "input": {}} for n in tools]
    return {"type": "assistant", "timestamp": ts(minute),
            "message": {"id": mid, "model": model, "content": content,
                        "usage": {"input_tokens": 5, "output_tokens": out,
                                  "cache_read_input_tokens": 100, "cache_creation_input_tokens": 50}}}


def test_codex_sums_records_across_sessions_and_dedupes_response_ids(tmp_path):
    a = write_jsonl(tmp_path / "a.jsonl", [{"timestamp": ts(0), "type": "turn_context", "payload": {"model": "gpt-x"}},
                                           codex_record(1, "r1", 100, 80, 7, 2), codex_record(2, "r2", 50, 40, 3)])
    b = write_jsonl(tmp_path / "b.jsonl", [codex_record(2, "r2", 50, 40, 3), codex_record(3, "r3", 10, 0, 1)])
    usage = codex_usage([a, b])
    assert usage == {"gpt-x": {"input": 40, "cache_read": 120, "cache_write": 0, "output": 11, "reasoning": 2}}


def test_codex_limit_delta_uses_first_and_last_snapshot(tmp_path):
    a = write_jsonl(tmp_path / "a.jsonl", [codex_limits(1, 20.0, 90.0), codex_limits(5, 27.0, 92.0)])
    b = write_jsonl(tmp_path / "b.jsonl", [codex_limits(3, 25.0, 91.0)])
    assert codex_limit_delta([a, b]) == {"primary": 7.0, "secondary": 2.0}


def test_claude_dedupes_by_message_id(tmp_path):
    p = write_jsonl(tmp_path / "s.jsonl", [claude_msg(1, "m1"), claude_msg(1, "m1"), claude_msg(2, "m2", out=20)])
    assert claude_usage([p]) == {"claude-opus-5-5": {"input": 10, "cache_read": 200, "cache_write": 100, "output": 30, "reasoning": 0}}


def test_claude_window_filters_main_session(tmp_path):
    p = write_jsonl(tmp_path / "s.jsonl", [claude_msg(1, "m1"), claude_msg(10, "m2"), claude_msg(30, "m3")])
    window = (datetime(2026, 11, 24, 20, 5, tzinfo=timezone.utc), datetime(2026, 11, 24, 20, 20, tzinfo=timezone.utc))
    assert claude_usage([p], window)["claude-opus-5-5"]["output"] == 10


def test_missing_transcript_returns_none(tmp_path):
    assert claude_usage([str(tmp_path / "nope.jsonl")]) is None
    assert codex_usage([]) is None
    assert codex_limit_delta([str(tmp_path / "nope.jsonl")]) is None


def test_active_seconds_subtracts_pauses():
    assert active_seconds("2026-11-24T20:00:00Z", "2026-11-24T21:00:00Z",
                          [["2026-11-24T20:10:00Z", "2026-11-24T20:20:00Z"]]) == (3000, 600)


def test_cost_uses_per_million_prices():
    prices = {"per_million_usd": {"m": {"input": 2.0, "cache_read": 0.5, "cache_write": 4.0, "output": 10.0}}}
    tokens = {"m": {"input": 1_000_000, "cache_read": 2_000_000, "cache_write": 0, "output": 100_000, "reasoning": 0}}
    assert cost(tokens, prices) == 4.0


def test_cost_none_when_model_price_missing():
    assert cost({"unknown": {"input": 1, "cache_read": 0, "cache_write": 0, "output": 0, "reasoning": 0}}, {"per_million_usd": {}}) is None


WEIGHTS = {"correctness": 0.5, "cost": 0.2, "time": 0.2, "limits": 0.1}


def variant(pass_rate, cost_usd, duration, limits):
    return {"pass_rate": pass_rate, "cost_usd": cost_usd, "duration_s": duration, "limits_pct": limits}


def test_score_minmax_lower_cost_better():
    scores = score([variant(1, 1, 10, 1), variant(1, 2, 10, 1), variant(1, 3, 10, 1)], WEIGHTS)
    assert scores[0] > scores[1] > scores[2]
    assert score([variant(1, 1, 10, 1)] * 3, WEIGHTS) == [100.0, 100.0, 100.0]


def test_score_none_when_acceptance_missing():
    scores = score([variant(None, 1, 10, 1), variant(1, 2, 10, 1)], WEIGHTS)
    assert scores[0] is None and scores[1] is not None


def test_timeline_classifies_claude_tools(tmp_path):
    p = write_jsonl(tmp_path / "s.jsonl", [claude_msg(0, "m1", tools=["Read"]), claude_msg(1, "m2", tools=["Write", "Bash"])])
    events = timeline(claude_paths=[p], codex_paths=[], start="2026-11-24T20:00:00Z")
    assert [(e["t"], e["kind"]) for e in events] == [(0, "read"), (60, "write"), (60, "command")]


def test_timeline_keeps_tool_uses_split_across_lines_with_same_message_id(tmp_path):
    first = claude_msg(0, "m1", tools=["Read"])
    second = claude_msg(0, "m1", tools=["Bash"])
    first["message"]["content"][0]["id"] = "tu1"
    second["message"]["content"][0]["id"] = "tu2"
    events = timeline(claude_paths=[write_jsonl(tmp_path / "s.jsonl", [first, second])], codex_paths=[], start="2026-11-24T20:00:00Z")
    assert [e["kind"] for e in events] == ["read", "command"]


def test_timeline_drops_events_outside_run_window(tmp_path):
    p = write_jsonl(tmp_path / "s.jsonl", [claude_msg(0, "m0", tools=["Read"]), claude_msg(5, "m1", tools=["Read"]),
                                           claude_msg(30, "m2", tools=["Read"])])
    events = timeline(claude_paths=[p], codex_paths=[], start="2026-11-24T20:01:00Z", end="2026-11-24T20:10:00Z")
    assert [e["t"] for e in events] == [240]


def test_timeline_marks_test_results_from_tool_output(tmp_path):
    rows = [claude_msg(0, "m1", tools=["Bash"]),
            {"type": "user", "timestamp": ts(1), "message": {"content": [{"type": "tool_result", "content": "# pass 3\n# fail 2"}]}},
            {"type": "user", "timestamp": ts(2), "message": {"content": [{"type": "tool_result", "content": "Tests: 12 passed"}]}}]
    events = timeline(claude_paths=[write_jsonl(tmp_path / "s.jsonl", rows)], codex_paths=[], start="2026-11-24T20:00:00Z")
    assert [e["kind"] for e in events] == ["command", "test_fail", "test_pass"]


def test_code_stats_skips_vendor_dirs(tmp_path):
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "a.js").write_text("a\nb\n")
    (tmp_path / "test").mkdir()
    (tmp_path / "test" / "a.test.js").write_text("t\n")
    (tmp_path / "node_modules").mkdir()
    (tmp_path / "node_modules" / "x.js").write_text("x\n" * 100)
    (tmp_path / "package-lock.json").write_text("{}\n" * 50)
    assert code_stats(str(tmp_path)) == {"loc": 3, "files": 2, "has_tests": True}
