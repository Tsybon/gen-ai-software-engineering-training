"""Task 2: validation rules, each in isolation, plus error body shape."""
import pytest

from conftest import create, payload


def post_invalid(api, **overrides):
    r = api.post("/transactions", json=payload(**overrides))
    assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text[:200]}"
    return r.json()


def detail_fields(body) -> set:
    return {d.get("field") for d in body.get("details", []) if isinstance(d, dict)}


@pytest.mark.parametrize("amount", [-50, 0, 10.555, "abc"], ids=["negative", "zero", "three_decimals", "non_number"])
def test_invalid_amount_rejected(api, amount):
    body = post_invalid(api, amount=amount)
    assert "amount" in detail_fields(body), body


@pytest.mark.parametrize("acc", ["ACC-12", "XYZ-12345", "ACC-1234!", "ACC-123456"])
def test_invalid_from_account_rejected(api, acc):
    body = post_invalid(api, fromAccount=acc)
    assert "fromAccount" in detail_fields(body), body


def test_invalid_to_account_rejected(api):
    body = post_invalid(api, toAccount="BAD-1")
    assert "toAccount" in detail_fields(body), body


def test_invalid_currency_rejected(api):
    body = post_invalid(api, currency="XYZ")
    assert "currency" in detail_fields(body), body


def test_error_body_shape(api):
    body = post_invalid(api, amount=-1)
    assert isinstance(body.get("error"), str) and body["error"]
    assert isinstance(body.get("details"), list) and body["details"]
    for d in body["details"]:
        assert isinstance(d.get("field"), str) and isinstance(d.get("message"), str), d


def test_multiple_errors_reported_together(api):
    body = post_invalid(api, amount=-1, currency="XYZ")
    assert {"amount", "currency"} <= detail_fields(body), body


def test_valid_alnum_account_accepted(api):
    create(api, fromAccount="ACC-AB12C")


@pytest.mark.parametrize("currency", ["EUR", "GBP", "JPY"])
def test_valid_currencies_accepted(api, currency):
    create(api, currency=currency, amount=100)


def test_min_amount_accepted(api):
    create(api, amount=0.01)


def test_two_decimals_accepted(api):
    create(api, amount=10.55)
