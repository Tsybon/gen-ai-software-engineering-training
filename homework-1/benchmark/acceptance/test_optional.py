"""Task 4 options A-C: probed; 404 means not implemented -> skip."""
import pytest

from conftest import create, new_account


def probe(api, url, **kw):
    r = api.get(url, **kw)
    if r.status_code == 404:
        pytest.skip("not implemented")
    assert r.status_code == 200, f"{r.status_code}: {r.text[:200]}"
    return r


def keys_lower(obj, out=None) -> dict:
    """Flatten nested dict keys (lower-case) -> value."""
    out = {} if out is None else out
    if isinstance(obj, dict):
        for k, v in obj.items():
            out[str(k).lower()] = v
            keys_lower(v, out)
    elif isinstance(obj, list):
        for v in obj:
            keys_lower(v, out)
    return out


def find(flat, *needles):
    for k, v in flat.items():
        if "account" not in k and any(n in k for n in needles):
            return v
    return None


def test_summary(api):
    a = new_account()
    create(api, type="deposit", toAccount=a, amount=300)
    create(api, type="withdrawal", fromAccount=a, amount=100)
    flat = keys_lower(probe(api, f"/accounts/{a}/summary").json())
    assert find(flat, "deposit") is not None, f"no deposits total: {flat}"
    assert find(flat, "withdraw") is not None, f"no withdrawals total: {flat}"
    count = find(flat, "count", "number")
    assert isinstance(count, int) and count >= 2, f"bad count: {flat}"
    assert find(flat, "recent", "last", "latest") is not None, f"no recent date: {flat}"


def test_interest(api):
    a = new_account()
    create(api, type="deposit", toAccount=a, amount=1000)
    r = probe(api, f"/accounts/{a}/interest", params={"rate": 0.05, "days": 30})
    flat = keys_lower(r.json())
    nums = [v for v in flat.values() if isinstance(v, (int, float)) and not isinstance(v, bool)]
    assert nums, f"no numeric result: {r.text[:200]}"


def test_csv_export(api):
    create(api)
    r = probe(api, "/transactions/export", params={"format": "csv"})
    first = r.text.lstrip().splitlines()[0].lower() if r.text.strip() else ""
    assert "csv" in r.headers.get("content-type", "") or "amount" in first, r.text[:200]
