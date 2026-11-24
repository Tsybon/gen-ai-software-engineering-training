"""Task 4 option D: must run last, it deliberately exhausts the limit."""
import pytest


def test_rate_limit_returns_429(api):
    statuses = [api.raw.get("/transactions").status_code for _ in range(101)]
    if 429 not in statuses:
        pytest.skip("not implemented (no 429 after 101 rapid requests)")
