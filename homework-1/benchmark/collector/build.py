"""Builds observatory/public/metrics.json from run records, agent logs and acceptance results.

Usage: cd benchmark && uv run python -m collector.build
"""
import json
import os
from datetime import datetime, timezone

from .claude_log import claude_usage
from .codex_log import codex_limit_delta, codex_usage
from .code_stats import code_stats
from .jsonl import TOKEN_KEYS, Tokens, parse_ts
from .metrics import active_seconds, cost, score
from .timeline import timeline

HERE = os.path.dirname(os.path.abspath(__file__))
BENCH = os.path.dirname(HERE)
ROOT = os.path.dirname(BENCH)
WEIGHTS = {"correctness": 0.5, "cost": 0.2, "time": 0.2, "limits": 0.1}
VARIANTS = [("synergy", "Synergy", 5103), ("codex", "Codex", 5101), ("opus", "Opus", 5102)]
OUTPUTS = [os.path.join(ROOT, "observatory", "public", "metrics.json"), os.path.join(BENCH, "results", "metrics.json")]


def load(name: str, default):
    path = os.path.join(BENCH, name)
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def merge(*usages: dict[str, Tokens] | None) -> dict[str, Tokens] | None:
    merged: dict[str, Tokens] = {}
    for usage in usages:
        for model, tokens in (usage or {}).items():
            bucket = merged.setdefault(model, dict.fromkeys(TOKEN_KEYS, 0))
            for k in TOKEN_KEYS:
                bucket[k] += tokens[k]
    return merged or None


def total_tokens(by_model: dict[str, Tokens] | None) -> Tokens | None:
    if not by_model:
        return None
    return {k: sum(t[k] for t in by_model.values()) for k in TOKEN_KEYS}


def claude_limit(entries: list[dict]) -> dict | None:
    """Sum of per-account deltas (re-login splits a run across accounts)."""
    done = [e for e in entries if "after_week_pct" in e]
    if not done:
        return None
    return {"session": sum(e["after_session_pct"] - e["before_session_pct"] for e in done),
            "week": sum(e["after_week_pct"] - e["before_week_pct"] for e in done)}


def debate(variant_dir: str) -> dict | None:
    folder = os.path.join(variant_dir, "debate")
    if not os.path.isdir(folder):
        return None
    order = ["plan-opus.md", "plan-codex.md"] + sorted(f for f in os.listdir(folder) if f.startswith("round-"))
    rounds = []
    for name in order:
        path = os.path.join(folder, name)
        if os.path.exists(path):
            stem = name[:-3]
            with open(path, encoding="utf-8") as fh:
                rounds.append({"author": "Opus" if stem.endswith("opus") else "Codex",
                               "round": 0 if stem.startswith("plan") else int(stem.split("-")[1]),
                               "markdown": fh.read()})
    decisions_path = os.path.join(variant_dir, "DECISIONS.md")
    decisions = open(decisions_path, encoding="utf-8").read() if os.path.exists(decisions_path) else None
    return {"rounds": rounds, "decisions_md": decisions}


def build_variant(vid: str, label: str, ui_port: int, run: dict | None, limits: dict, prices: dict, acceptance: dict) -> dict:
    vdir = os.path.join(ROOT, "variants", vid)
    out = {"id": vid, "label": label, "app_url": f"http://localhost:{ui_port}", "models": [],
           "tokens": None, "tokens_by_model": None, "duration_s": None, "paused_s": None, "cost_usd": None,
           "limits": None, "acceptance": acceptance.get(vid), "code": code_stats(vdir) if os.path.isdir(vdir) else None,
           "timeline": [], "debate": debate(vdir) if vid == "synergy" else None,
           "run": None}
    if not run or not run.get("end"):
        return out
    window = (parse_ts(run["start"]), parse_ts(run["end"]))
    claude = merge(claude_usage(run.get("claude_transcripts", [])),
                   claude_usage([run["main_session"]], window) if run.get("main_session") else None)
    codex = codex_usage(run.get("codex_sessions", []))
    by_model = merge(claude, codex)
    duration, paused = active_seconds(run["start"], run["end"], run.get("pauses", []))
    codex_limits = codex_limit_delta(run.get("codex_sessions", []))
    claude_limits = claude_limit(limits.get(vid, {}).get("claude", []))
    claude_paths = run.get("claude_transcripts", []) + ([run["main_session"]] if run.get("main_session") else [])
    out.update(
        models=sorted(by_model) if by_model else run.get("models", []),
        tokens=total_tokens(by_model), tokens_by_model=by_model,
        duration_s=duration, paused_s=paused, cost_usd=cost(by_model, prices),
        limits={"codex_5h_pct": codex_limits and codex_limits["primary"],
                "codex_week_pct": codex_limits and codex_limits["secondary"],
                "claude_session_pct": claude_limits and claude_limits["session"],
                "claude_week_pct": claude_limits and claude_limits["week"]},
        timeline=timeline(claude_paths, run.get("codex_sessions", []), run["start"], run["end"]),
        run={"start": run["start"], "end": run["end"]},
    )
    return out


def limits_for_score(v: dict) -> float | None:
    lim = v.get("limits") or {}
    parts = [lim.get("codex_week_pct"), lim.get("claude_week_pct")]
    return None if all(p is None for p in parts) else sum(p or 0 for p in parts)


def main() -> None:
    runs, limits, prices = load("runs.json", {}), load("limits.json", {}), load("prices.json", {})
    acceptance = load(os.path.join("results", "acceptance.json"), {})
    variants = [build_variant(vid, label, port, runs.get(vid), limits, prices, acceptance) for vid, label, port in VARIANTS]
    inputs = [{"pass_rate": (v["acceptance"]["passed"] / v["acceptance"]["total"]) if v["acceptance"] and v["acceptance"]["total"] else None,
               "cost_usd": v["cost_usd"], "duration_s": v["duration_s"], "limits_pct": limits_for_score(v)} for v in variants]
    for v, s, i in zip(variants, score(inputs, WEIGHTS), inputs):
        v["score"], v["limits_score_pct"], v["pass_rate"] = s, i["limits_pct"], i["pass_rate"]
    ranked = sorted((v for v in variants if v["score"] is not None), key=lambda v: -v["score"])
    for rank, v in enumerate(ranked, 1):
        v["rank"] = rank
    doc = {"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "weights": WEIGHTS,
           "prices": prices, "variants": variants}
    for path in OUTPUTS:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(doc, fh, indent=1)
    for v in variants:
        print(f"{v['label']:8} tokens={v['tokens']} time={v['duration_s']}s cost=${v['cost_usd']} limits={v['limits']} "
              f"accept={v['acceptance'] and (v['acceptance']['passed'], v['acceptance']['total'])} score={v['score']} events={len(v['timeline'])}")


if __name__ == "__main__":
    main()
