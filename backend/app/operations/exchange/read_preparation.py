"""Transaction boundaries for durable exchange data used by financial reads."""
from app.operations.exchange.repair import repair_snapshot_batch


def finish_exchange_work(db):
    snapshots = db.info.pop("transaction_exchange_snapshots_dirty", False)
    rates = db.info.pop("exchange_rates_dirty", False)
    if snapshots or rates:
        db.commit()


def prepare_report_snapshots(db, user_id):
    """Repair legacy rows before report aggregation, preserving saved rates."""
    after_id = 0
    while True:
        result = repair_snapshot_batch(db, after_id=after_id, user_id=user_id)
        db.info.pop("transaction_exchange_snapshots_dirty", None)
        db.info.pop("exchange_rates_dirty", None)
        if result["examined"] < 500:
            break
        after_id = result["last_id"]
