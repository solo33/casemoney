from datetime import datetime, timedelta, timezone

from app.models.exchange_rate import ExchangeRate
from app.services import exchange
from tests.conftest import TestingSessionLocal


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
