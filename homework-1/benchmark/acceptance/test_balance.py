"""Task 1 balance semantics; only completed transactions are expected to move money."""
import pytest

from conftest import create, get_usd_balance, new_account, require_completed


def deposit(api, acc, amount):
    tx = create(api, type="deposit", fromAccount=new_account(), toAccount=acc, amount=amount)
    require_completed(tx)
    return tx


def test_deposit_increases_balance(api):
    acc = new_account()
    deposit(api, acc, 250.75)
    assert get_usd_balance(api, acc) == pytest.approx(250.75)


def test_withdrawal_reduces_balance(api):
    acc = new_account()
    deposit(api, acc, 300)
    tx = create(api, type="withdrawal", fromAccount=acc, toAccount=new_account(), amount=120.25)
    require_completed(tx)
    assert get_usd_balance(api, acc) == pytest.approx(179.75)


def test_transfer_moves_money_between_accounts(api):
    a, b = new_account(), new_account()
    deposit(api, a, 500)
    tx = create(api, type="transfer", fromAccount=a, toAccount=b, amount=200)
    require_completed(tx)
    assert get_usd_balance(api, a) == pytest.approx(300)
    assert get_usd_balance(api, b) == pytest.approx(200)
