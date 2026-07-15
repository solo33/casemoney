from datetime import datetime, timedelta, timezone

import pytest

from app.models.exchange_rate import ExchangeRate
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
