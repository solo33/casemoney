from datetime import datetime, timedelta, timezone

import pytest

from app.models.exchange_rate import ExchangeRate
from app.models.transaction import Transaction, TransactionType
from app.models.user import User
from app.services import exchange
from tests.conftest import TestingSessionLocal


def test_rate_is_reused_for_24_hours(monkeypatch):
    db = TestingSessionLocal()
    try:
        db.add(ExchangeRate(
            from_currency="USD",
            to_currency="RUB",
            rate=92.0,
            source="cbr",
            updated_at=datetime.now(timezone.utc) - timedelta(hours=23),
        ))
        db.commit()

        def must_not_fetch():
            raise AssertionError("fresh daily rate must be read from the database")

        monkeypatch.setattr(exchange, "fetch_cbr_to_rub", must_not_fetch)
        assert exchange.get_rate_to_rub(db, "USD") == 92.0
    finally:
        db.close()


def test_stale_rate_is_used_when_provider_is_unavailable(monkeypatch):
    db = TestingSessionLocal()
    try:
        db.add(ExchangeRate(
            from_currency="USD",
            to_currency="RUB",
            rate=91.5,
            source="cbr",
            updated_at=datetime.now(timezone.utc) - timedelta(days=2),
        ))
        db.commit()

        def unavailable():
            raise exchange.ExchangeError("provider unavailable")

        monkeypatch.setattr(exchange, "fetch_cbr_to_rub", unavailable)

        assert exchange.get_rate_to_rub(db, "USD") == 91.5
        assert exchange.convert(db, 2, "USD", "RUB") == 183.0
    finally:
        db.close()


def test_fiat_provider_response_is_cached_for_all_currencies(monkeypatch):
    db = TestingSessionLocal()
    calls = {"count": 0}
    try:
        def fetch_all():
            calls["count"] += 1
            return {"RUB": 1.0, "USD": 90.0, "EUR": 100.0, "UAH": 2.2}

        monkeypatch.setattr(exchange, "fetch_cbr_to_rub", fetch_all)

        assert exchange.get_rate_to_rub(db, "USD") == 90.0
        assert exchange.get_rate_to_rub(db, "EUR") == 100.0
        assert exchange.get_rate_to_rub(db, "UAH") == 2.2
        assert calls["count"] == 1
    finally:
        db.close()


def test_unavailable_provider_is_not_retried_for_each_currency(monkeypatch):
    db = TestingSessionLocal()
    calls = {"count": 0}
    try:
        def unavailable():
            calls["count"] += 1
            raise exchange.ExchangeError("provider unavailable")

        monkeypatch.setattr(exchange, "fetch_cbr_to_rub", unavailable)

        with pytest.raises(exchange.ExchangeError):
            exchange.get_rate_to_rub(db, "USD")
        with pytest.raises(exchange.ExchangeError):
            exchange.get_rate_to_rub(db, "EUR")
        assert calls["count"] == 1
    finally:
        db.close()


def test_transaction_uses_saved_exchange_snapshot_after_rate_changes(monkeypatch):
    """Историческая операция не должна переоцениваться по сегодняшнему курсу."""
    db = TestingSessionLocal()
    try:
        user = User(email="snapshot@test.com", username="snapshot", hashed_password="x")
        db.add(user)
        db.commit()

        transaction = Transaction(
            user_id=user.id,
            account_id=1,
            amount=10,
            currency="USD",
            type=TransactionType.expense,
        )
        db.add(transaction)

        monkeypatch.setattr(
            exchange,
            "get_rate_for_user",
            lambda *_args: (90.0, "test"),
        )
        assert exchange.snapshot_transaction_rates(db, user.id, transaction)
        assert transaction.exchange_rate == 90.0
        assert transaction.valuation_currency == "RUB"

        # После обновления источника исторический результат всё равно 900 ₽.
        monkeypatch.setattr(
            exchange,
            "get_rate_for_user",
            lambda *_args: (100.0, "test"),
        )
        assert exchange.convert_transaction_for_user(db, user.id, transaction, "RUB") == 900.0
        assert transaction.exchange_rate == 90.0
    finally:
        db.close()


def test_old_transaction_snapshot_is_filled_once_lazily(monkeypatch):
    db = TestingSessionLocal()
    try:
        user = User(email="lazy-snapshot@test.com", username="lazy", hashed_password="x")
        db.add(user)
        db.commit()
        transaction = Transaction(
            user_id=user.id,
            account_id=1,
            amount=5,
            currency="EUR",
            type=TransactionType.income,
        )

        monkeypatch.setattr(exchange, "get_rate_for_user", lambda *_args: (101.5, "test"))
        assert exchange.convert_transaction_for_user(db, user.id, transaction, "RUB") == 507.5
        assert transaction.exchange_rate == 101.5

        monkeypatch.setattr(exchange, "get_rate_for_user", lambda *_args: (120.0, "test"))
        assert exchange.convert_transaction_for_user(db, user.id, transaction, "RUB") == 507.5
    finally:
        db.close()
