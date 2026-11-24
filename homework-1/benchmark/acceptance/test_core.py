"""Task 1: core endpoints and transaction model."""
from conftest import VALID_STATUSES, create, new_account, parse_ts, payload

FIELDS = ("id", "fromAccount", "toAccount", "amount", "currency", "type", "timestamp", "status")


def test_post_returns_201_with_all_model_fields(api):
    body = payload(type="transfer")  # the spec's own sample; both accounts are meaningful
    r = api.post("/transactions", json=body)
    assert r.status_code == 201, r.text[:200]
    tx = r.json()
    missing = [f for f in FIELDS if f not in tx]
    assert not missing, f"missing fields: {missing}"
    assert isinstance(tx["id"], str) and tx["id"]
    for f in ("fromAccount", "toAccount", "currency", "type"):
        assert tx[f] == body[f], f"{f}: {tx[f]!r} != {body[f]!r}"
    assert float(tx["amount"]) == body["amount"]


def test_post_timestamp_is_iso8601(api):
    tx = create(api)
    parse_ts(tx["timestamp"])


def test_post_status_is_valid_value(api):
    tx = create(api)
    assert tx["status"] in VALID_STATUSES


def test_list_returns_array_containing_created(api):
    tx = create(api)
    r = api.get("/transactions")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list), f"expected JSON array, got {type(body).__name__}"
    assert tx["id"] in {t.get("id") for t in body}


def test_get_by_id_returns_same_transaction(api):
    tx = create(api)
    r = api.get(f"/transactions/{tx['id']}")
    assert r.status_code == 200
    got = r.json()
    for f in FIELDS:
        assert got.get(f) == tx[f], f"{f}: {got.get(f)!r} != {tx[f]!r}"


def test_get_unknown_id_returns_404(api):
    r = api.get("/transactions/does-not-exist-9f8e7d6c")
    assert r.status_code == 404


def test_balance_endpoint_returns_200(api):
    acc = new_account()
    create(api, toAccount=acc)
    r = api.get(f"/accounts/{acc}/balance")
    assert r.status_code == 200
    r.json()
