"""Exact arithmetic regressions; storage guarantees require PostgreSQL."""
from decimal import Decimal

import pytest
from pydantic import TypeAdapter, ValidationError

from app.money import MoneyValue
from app.models.account_balance import AccountBalance
from app.models.transaction import Transaction
from tests.conftest import TestingSessionLocal, make_account, test_engine


def test_money_validates_without_float_round_trip():
    adapter = TypeAdapter(MoneyValue)
    value = adapter.validate_python("9007199254740993.123456789")
    assert value == Decimal("9007199254740993.123456789")
    assert adapter.dump_json(Decimal("0.25")) == b"0.25"
    for invalid in ("NaN", "Infinity", "-Infinity"):
        with pytest.raises(ValidationError):
            adapter.validate_python(invalid)


def test_idempotency_distinguishes_amounts_beyond_float_precision():
    from app.operations.transactions.common import _request_hash
    from app.schemas.transaction import TransactionCreate
    values = [TransactionCreate(account_id=1, type="income", currency="RUB", amount=value)
              for value in ("9007199254740993.1", "9007199254740993.2")]
    assert _request_hash(values[0]) != _request_hash(values[1])


def test_fractional_posting_and_reversal(client, auth):
    account = make_account(client, auth, balance=0.3)
    ids = []
    for amount in (0.1, 0.2):
        response = client.post("/api/transactions/", headers=auth, json={
            "account_id": account["id"], "amount": amount,
            "type": "expense", "currency": "RUB",
        })
        assert response.status_code == 201, response.text
        ids.append(response.json()["id"])
    with TestingSessionLocal() as db:
        balance = db.query(AccountBalance).filter_by(account_id=account["id"]).one()
        assert balance.balance == Decimal("0")
    for tx_id in ids:
        assert client.delete(f"/api/transactions/{tx_id}", headers=auth).status_code == 204
    with TestingSessionLocal() as db:
        assert db.query(AccountBalance).filter_by(account_id=account["id"]).one().balance == Decimal("0.3")


@pytest.mark.skipif(test_engine.dialect.name != "postgresql", reason="Exact NUMERIC storage requires PostgreSQL")
def test_postgres_preserves_more_than_float_precision(client, auth):
    account = make_account(client, auth, balance=0)
    value = "9007199254740993.123456789"
    response = client.post("/api/transactions/", headers=auth, json={
        "account_id": account["id"], "amount": value,
        "type": "income", "currency": "RUB",
    })
    assert response.status_code == 201, response.text
    with TestingSessionLocal() as db:
        assert db.get(Transaction, response.json()["id"]).amount == Decimal(value)
        assert db.query(AccountBalance).filter_by(account_id=account["id"]).one().balance == Decimal(value)
