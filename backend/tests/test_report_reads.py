"""Exchange preparation is durable; prepared historical reports stay stable."""
from datetime import datetime, timedelta, timezone
from sqlalchemy import event
import pytest

from app.models.exchange_rate import ExchangeRate
from app.models.transaction import Transaction
from app.operations.exchange.repair import repair_snapshot_batch
from app.operations.exchange.commands import refresh_rates
from app.services import exchange
from app.models.user import User
from tests.conftest import TestingSessionLocal, test_engine, make_account


def legacy_transaction(client, auth):
    account = make_account(client, auth, balance=100, currency="EUR")
    response = client.post("/api/transactions/", headers=auth, json={
        "account_id": account["id"], "amount": 5,
        "currency": "EUR", "type": "income",
    })
    assert response.status_code == 201, response.text
    tx_id = response.json()["id"]
    with TestingSessionLocal() as db:
        tx = db.get(Transaction, tx_id)
        tx.exchange_rate = tx.exchange_rate_source = tx.valuation_currency = None
        db.query(ExchangeRate).delete()
        db.commit()
    exchange.invalidate_user_rates()
    return tx_id


def test_prepared_reports_issue_only_reads(client, auth):
    tx_id = legacy_transaction(client, auth)
    first = client.get("/api/reports/summary", headers=auth)
    assert first.status_code == 200, first.text
    assert first.json()["total_income"] == 500
    exchange.invalidate_user_rates()  # Simulate loss of all process caches.

    statements = []
    def record(_connection, _cursor, statement, _parameters, _context, _many):
        statements.append(statement.lstrip().split()[0].upper())
    event.listen(test_engine, "before_cursor_execute", record)
    try:
        for path in ("summary", "annual", "annual-balances", "monthly-trend", "yoy"):
            response = client.get(f"/api/reports/{path}", headers=auth,
                                  params={"year": datetime.now().year})
            assert response.status_code == 200, response.text
        assert not ({"INSERT", "UPDATE", "DELETE"} & set(statements)), statements
    finally:
        event.remove(test_engine, "before_cursor_execute", record)
    with TestingSessionLocal() as db:
        assert db.get(Transaction, tx_id).exchange_rate == 100
        assert db.query(ExchangeRate).count() > 0


def test_explicit_repair_persists_once(client, auth, monkeypatch):
    tx_id = legacy_transaction(client, auth)
    with TestingSessionLocal() as db:
        result = repair_snapshot_batch(db)
        assert result["changed"] == 1
        assert db.get(Transaction, tx_id).exchange_rate == 100
    monkeypatch.setattr(exchange, "get_rate_for_user", lambda *_: (120, "test"))
    with TestingSessionLocal() as db:
        assert repair_snapshot_batch(db)["changed"] == 0
        assert exchange.convert_transaction_for_user(db, 1, db.get(Transaction, tx_id), "RUB") == 500


def test_explicit_refresh_persists_provider_rates():
    with TestingSessionLocal() as db:
        result = refresh_rates(db)
        assert result["saved"] > 0
    with TestingSessionLocal() as db:
        assert db.query(ExchangeRate).filter_by(from_currency="EUR").one().rate == 100


def test_persisted_rates_survive_restart_and_provider_outage(client, monkeypatch):
    response = client.get("/api/exchange-rates/convert", params={"amount": 2, "from": "EUR", "to": "RUB"})
    assert response.status_code == 200, response.text
    assert response.json()["converted"] == 200
    exchange.invalidate_user_rates()
    def unavailable():
        raise exchange.ExchangeError("unavailable")
    monkeypatch.setattr(exchange, "fetch_cbr_to_rub", unavailable)
    with TestingSessionLocal() as db:
        assert exchange.get_rate_to_rub(db, "EUR") == 100
        db.query(ExchangeRate).update({"updated_at": datetime.now(timezone.utc) - timedelta(days=2)})
        db.commit()
    exchange.invalidate_user_rates()
    with TestingSessionLocal() as db:
        assert exchange.get_rate_to_rub(db, "EUR") == 100
        assert db.query(ExchangeRate).count() > 0


def test_report_value_survives_provider_refresh(client, auth, monkeypatch):
    tx_id = legacy_transaction(client, auth)
    first = client.get("/api/reports/summary", headers=auth)
    assert first.status_code == 200, first.text
    assert first.json()["total_income"] == 500
    monkeypatch.setattr(exchange, "fetch_cbr_to_rub", lambda: {"RUB": 1, "EUR": 120})
    with TestingSessionLocal() as db:
        refresh_rates(db)
    exchange.invalidate_user_rates()
    second = client.get("/api/reports/summary", headers=auth)
    assert second.status_code == 200, second.text
    assert second.json()["total_income"] == 500
    with TestingSessionLocal() as db:
        assert db.get(Transaction, tx_id).exchange_rate == 100
        assert db.query(ExchangeRate).filter_by(from_currency="EUR").one().rate == 120


def test_rolled_back_rates_are_not_reused_by_next_request(monkeypatch):
    with TestingSessionLocal() as db:
        user = User(email="rate-rollback@test.com", username="rate", hashed_password="unused")
        db.add(user)
        db.commit()
        user_id = user.id
        assert exchange.get_rate_for_user(db, user_id, "EUR", "RUB")[0] == 100
        db.rollback()
        monkeypatch.setattr(exchange, "fetch_cbr_to_rub", lambda: {"RUB": 1, "EUR": 120})
        assert exchange.get_rate_for_user(db, user_id, "EUR", "RUB")[0] == 120

        db.rollback()
    with TestingSessionLocal() as db:
        assert db.query(ExchangeRate).count() == 0
        assert exchange.get_rate_for_user(db, user_id, "EUR", "RUB")[0] == 120


@pytest.mark.parametrize("path", ["/api/reports/summary", "/api/exchange-rates/convert?amount=2&from=EUR&to=RUB"])
def test_exchange_writeback_finishes_before_success_response(auth, monkeypatch, path):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.api import financial_dependencies
    def fail(_db):
        raise RuntimeError("writeback failed")
    monkeypatch.setattr(financial_dependencies, "finish_exchange_work", fail)
    response = TestClient(app, raise_server_exceptions=False).get(path, headers=auth)
    assert response.status_code == 500
    with TestingSessionLocal() as db:
        assert db.query(ExchangeRate).count() == 0


@pytest.mark.skipif(test_engine.dialect.name != "postgresql", reason="Concurrent writes require PostgreSQL")
def test_parallel_provider_cache_writes_keep_one_currency_pair():
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    barrier = Barrier(2)
    def save(value):
        with TestingSessionLocal() as db:
            barrier.wait(timeout=10)
            exchange._save_rate(db, "EUR", "RUB", value, "test")
            db.commit()
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(save, value) for value in (100, 120)]
        for future in futures:
            future.result(timeout=20)
    with TestingSessionLocal() as db:
        rows = db.query(ExchangeRate).filter_by(from_currency="EUR", to_currency="RUB").all()
        assert len(rows) == 1
        assert rows[0].rate in (100, 120)
