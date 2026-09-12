from datetime import datetime

import pytest

from app.models.transaction import Transaction
from app.models.transaction_history import TransactionHistory
from app.services.exchange_snapshots import snapshot_transaction_rates
from tests.conftest import TestingSessionLocal
from tests.test_report_reads import legacy_transaction


@pytest.mark.parametrize("timestamp", [datetime(2024, 12, 25, 12, 30), None])
def test_report_snapshot_preserves_original_edit_timestamp(client, auth, timestamp):
    tx_id = legacy_transaction(client, auth)
    with TestingSessionLocal() as db:
        tx = db.get(Transaction, tx_id)
        tx.updated_at = timestamp
        db.commit()
        history_count = db.query(TransactionHistory).count()
    response = client.get("/api/reports/summary", headers=auth)
    assert response.status_code == 200, response.text
    with TestingSessionLocal() as db:
        tx = db.get(Transaction, tx_id)
        assert tx.exchange_rate is not None
        assert (tx.updated_at.replace(tzinfo=None) if tx.updated_at else None) == timestamp
        assert db.query(TransactionHistory).count() == history_count


def test_real_edit_with_snapshot_still_updates_timestamp(client, auth):
    tx_id = legacy_transaction(client, auth)
    old = datetime(2024, 12, 25)
    with TestingSessionLocal() as db:
        tx = db.get(Transaction, tx_id)
        tx.updated_at = old
        db.commit()
        # Both updates in one flush must count as a real edit.
        with db.no_autoflush:
            tx.description = "Actual user edit"
            snapshot_transaction_rates(db, tx.user_id, tx)
        db.commit()
        assert tx.updated_at.replace(tzinfo=None) > old


def test_two_transfer_sides_and_expired_timestamp_are_preserved(client, auth):
    tx_id = legacy_transaction(client, auth)
    old = datetime(2024, 12, 25)
    with TestingSessionLocal() as db:
        tx = db.get(Transaction, tx_id)
        tx.updated_at = old
        db.commit()
        db.expire(tx, ["updated_at"])
        tx.exchange_rate = 99
        tx.valuation_currency = "RUB"
        tx.to_exchange_rate = 101
        db.commit()
        assert tx.updated_at.replace(tzinfo=None) == old
        tx.updated_at = datetime(2025, 1, 1)
        tx.exchange_rate = 100
        db.commit()
        assert tx.updated_at.replace(tzinfo=None) == datetime(2025, 1, 1)
