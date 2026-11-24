"""Shared fixtures and helpers for the black-box acceptance suite (written from TASKS.md only)."""
import os
import random
import string
import time
from datetime import datetime

import httpx
import pytest

MIN_INTERVAL_S = 60 / 90  # stay <= 90 req/min; APIs may rate-limit at 100/min
VALID_STATUSES = {"pending", "completed", "failed"}


class ThrottledClient:
    """httpx client that spaces requests so the suite never trips a 100/min limiter."""

    def __init__(self, base_url: str):
        self.raw = httpx.Client(base_url=base_url, timeout=10.0)
        self._last = 0.0

    def request(self, method: str, url: str, **kw) -> httpx.Response:
        wait = MIN_INTERVAL_S - (time.monotonic() - self._last)
        if wait > 0:
            time.sleep(wait)
        try:
            return self.raw.request(method, url, **kw)
        finally:
            self._last = time.monotonic()

    def get(self, url: str, **kw) -> httpx.Response:
        return self.request("GET", url, **kw)

    def post(self, url: str, **kw) -> httpx.Response:
        return self.request("POST", url, **kw)


@pytest.fixture(scope="session")
def base_url() -> str:
    return os.environ.get("BASE_URL", "http://localhost:3000").rstrip("/")


@pytest.fixture(scope="session")
def api(base_url):
    client = ThrottledClient(base_url)
    yield client
    client.raw.close()


def new_account() -> str:
    """Fresh valid account id (ACC- + 5 uppercase alnum); state is shared across tests."""
    return "ACC-" + "".join(random.choices(string.ascii_uppercase + string.digits, k=5))


def payload(**overrides) -> dict:
    body = {
        "fromAccount": new_account(),
        "toAccount": new_account(),
        "amount": 100.50,
        "currency": "USD",
        "type": "deposit",
    }
    body.update(overrides)
    return body


def create(api, **overrides) -> dict:
    """POST a transaction that must succeed; returns the created JSON."""
    r = api.post("/transactions", json=payload(**overrides))
    assert r.status_code == 201, f"expected 201, got {r.status_code}: {r.text[:200]}"
    return r.json()


def require_completed(tx: dict) -> None:
    if tx.get("status") != "completed":
        pytest.skip(f"transaction status is {tx.get('status')!r}, not 'completed'")


def items_of(body):
    """List body, tolerating a wrapper object holding one list."""
    if isinstance(body, list):
        return body
    if isinstance(body, dict):
        for v in body.values():
            if isinstance(v, list):
                return v
    raise AssertionError(f"no transaction list in response: {str(body)[:200]}")


def parse_ts(value) -> datetime:
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def _is_num(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def usd_balance(body):
    """Tolerantly find the USD balance in an unspecified response shape; None if absent."""
    if isinstance(body, dict):
        if "USD" in body:
            v = body["USD"]
            return v if _is_num(v) else usd_balance(v)
        if str(body.get("currency", "")).upper() == "USD":
            for k in ("balance", "amount", "value"):
                if _is_num(body.get(k)):
                    return body[k]
        for v in body.values():
            if isinstance(v, (dict, list)):
                found = usd_balance(v)
                if found is not None:
                    return found
        for k in ("balance", "amount"):
            if _is_num(body.get(k)):
                return body[k]
        if isinstance(body.get("balance"), dict):
            return usd_balance(body["balance"])
    if isinstance(body, list):
        for v in body:
            found = usd_balance(v)
            if found is not None:
                return found
    return None


def get_usd_balance(api, account: str) -> float:
    r = api.get(f"/accounts/{account}/balance")
    assert r.status_code == 200, f"balance: {r.status_code} {r.text[:200]}"
    value = usd_balance(r.json())
    assert value is not None, f"no USD balance in {r.text[:200]}"
    return float(value)
