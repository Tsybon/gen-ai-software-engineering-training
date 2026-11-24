"""Task 3: GET /transactions filters, alone and combined."""
from datetime import timedelta

from conftest import create, items_of, new_account, parse_ts


def listing(api, **params):
    r = api.get("/transactions", params=params)
    assert r.status_code == 200, f"{r.status_code}: {r.text[:200]}"
    return items_of(r.json())


def ids(items) -> set:
    return {t.get("id") for t in items}


def involves(t, acc) -> bool:
    return acc in (t.get("fromAccount"), t.get("toAccount"))


def day_window(tx):
    day = parse_ts(tx["timestamp"]).date()
    return day - timedelta(days=1), day + timedelta(days=1)


def in_window(t, lo, hi) -> bool:
    return lo <= parse_ts(t["timestamp"]).date() <= hi


def test_filter_by_account(api):
    a = new_account()
    mine = create(api, toAccount=a)
    other = create(api)
    items = listing(api, accountId=a)
    assert mine["id"] in ids(items) and other["id"] not in ids(items)
    assert all(involves(t, a) for t in items)


def test_filter_by_type(api):
    a = new_account()
    dep = create(api, type="deposit", toAccount=a, amount=50)
    tr = create(api, type="transfer", fromAccount=a, amount=10)
    items = listing(api, type="transfer")
    assert tr["id"] in ids(items) and dep["id"] not in ids(items)
    assert all(t.get("type") == "transfer" for t in items)


def test_filter_by_date_range_includes_today(api):
    tx = create(api)
    lo, hi = day_window(tx)
    items = listing(api, **{"from": lo.isoformat(), "to": hi.isoformat()})
    assert tx["id"] in ids(items)
    assert all(in_window(t, lo, hi) for t in items)


def test_filter_by_past_date_range_excludes_new(api):
    tx = create(api)
    items = listing(api, **{"from": "2000-01-01", "to": "2000-01-31"})
    assert tx["id"] not in ids(items)
    assert all(parse_ts(t["timestamp"]).year == 2000 for t in items)


def test_filter_account_and_type_combined(api):
    a = new_account()
    dep = create(api, type="deposit", toAccount=a, amount=50)
    tr = create(api, type="transfer", fromAccount=a, amount=10)
    foreign = create(api, type="deposit")
    items = listing(api, accountId=a, type="deposit")
    assert dep["id"] in ids(items)
    assert tr["id"] not in ids(items) and foreign["id"] not in ids(items)
    assert all(involves(t, a) and t.get("type") == "deposit" for t in items)


def test_filter_account_and_date_combined(api):
    a = new_account()
    tx = create(api, toAccount=a)
    lo, hi = day_window(tx)
    items = listing(api, accountId=a, **{"from": lo.isoformat(), "to": hi.isoformat()})
    assert ids(items) == {tx["id"]}
    past = listing(api, accountId=a, **{"from": "2000-01-01", "to": "2000-01-31"})
    assert past == []
