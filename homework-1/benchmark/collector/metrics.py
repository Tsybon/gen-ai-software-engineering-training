"""Duration, cost and weighted score."""
from .jsonl import Tokens, parse_ts

PRICE_KEYS = ("input", "cache_read", "cache_write", "output")
HIGHER_IS_BETTER = {"correctness": "pass_rate"}
LOWER_IS_BETTER = {"cost": "cost_usd", "time": "duration_s", "limits": "limits_pct"}


def active_seconds(start: str, end: str, pauses: list[list[str]]) -> tuple[int, int]:
    """(active duration, paused total) in whole seconds."""
    paused = sum((parse_ts(b) - parse_ts(a)).total_seconds() for a, b in pauses)
    total = (parse_ts(end) - parse_ts(start)).total_seconds()
    return int(total - paused), int(paused)


def cost(tokens_by_model: dict[str, Tokens] | None, prices: dict) -> float | None:
    """Estimated USD from list prices per million tokens; None if any model has no price."""
    if not tokens_by_model:
        return None
    table = prices.get("per_million_usd", {})
    usd = 0.0
    for model, tokens in tokens_by_model.items():
        price = table.get(model)
        if price is None:
            return None
        usd += sum(tokens.get(k, 0) * price[k] for k in PRICE_KEYS) / 1_000_000
    return round(usd, 4)


def _normalize(values: list[float | None], higher_better: bool) -> list[float | None]:
    present = [v for v in values if v is not None]
    if not present:
        return [None] * len(values)
    lo, hi = min(present), max(present)
    out = []
    for v in values:
        if v is None:
            out.append(None)
        elif hi == lo:
            out.append(1.0)
        else:
            frac = (v - lo) / (hi - lo)
            out.append(frac if higher_better else 1 - frac)
    return out


def score(variants: list[dict], weights: dict[str, float]) -> list[float | None]:
    """0..100 weighted score, min-max normalized across variants. None if correctness is unknown.

    Correctness uses the absolute pass rate (0..1) instead of min-max, so a perfect suite isn't penalized.
    Missing non-correctness metrics count as the worst value (0).
    """
    columns = {name: _normalize([v[key] for v in variants], False) for name, key in LOWER_IS_BETTER.items()}
    result = []
    for i, v in enumerate(variants):
        if v["pass_rate"] is None:
            result.append(None)
            continue
        total = weights["correctness"] * v["pass_rate"]
        total += sum(weights[name] * (columns[name][i] or 0.0) for name in LOWER_IS_BETTER)
        result.append(round(100 * total, 1))
    return result
