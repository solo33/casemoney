"""Restore proven technical timestamp changes from an isolated pre-release DB.

Defaults to dry-run. Only matching content, tags and audit history are eligible.
Never substitutes the operation date or replaces a whole production row.
"""
import argparse
from collections import Counter
from datetime import datetime
from decimal import Decimal
import json
import os

import psycopg2
from psycopg2.extras import execute_batch
from sqlalchemy.engine import make_url


TECHNICAL = {"updated_at", "valuation_currency", "exchange_rate", "exchange_rate_source",
             "to_exchange_rate", "to_exchange_rate_source"}


def read_state(connection):
    with connection.cursor() as cursor:
        cursor.execute("SELECT row_to_json(t)::text FROM transactions t")
        rows = [json.loads(item[0], parse_float=Decimal) for item in cursor]
        cursor.execute("SELECT transaction_id, max(id) FROM transaction_history GROUP BY transaction_id")
        history = dict(cursor.fetchall())
        cursor.execute("SELECT transaction_id, tag_id FROM transaction_tags ORDER BY tag_id")
        tags = {}
        for tx_id, tag_id in cursor:
            tags.setdefault(tx_id, []).append(tag_id)
    return {row["id"]: row for row in rows}, history, tags


def plan_restore(current_state, baseline_state, since, until):
    current, history, tags = current_state
    baseline, old_history, old_tags = baseline_state
    candidates, excluded = [], Counter()
    for tx_id, row in current.items():
        old = baseline.get(tx_id)
        if old is None:
            excluded["new_record"] += 1
        elif row["updated_at"] == old["updated_at"]:
            excluded["unchanged"] += 1
        elif {k: v for k, v in row.items() if k not in TECHNICAL} != {k: v for k, v in old.items() if k not in TECHNICAL}:
            excluded["changed_content"] += 1
        elif history.get(tx_id) != old_history.get(tx_id) or tags.get(tx_id, []) != old_tags.get(tx_id, []):
            excluded["changed_history_or_tags"] += 1
        elif not row.get("valuation_currency") or row.get("exchange_rate") is None:
            excluded["missing_snapshot_evidence"] += 1
        elif not any(row.get(key) != old.get(key) for key in TECHNICAL - {"updated_at"}):
            excluded["unchanged_snapshot"] += 1
        elif not row["updated_at"] or not since <= datetime.fromisoformat(row["updated_at"]) <= until:
            excluded["outside_window"] += 1
        else:
            candidates.append((old["updated_at"], tx_id, row["updated_at"]))
    return candidates, excluded


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-db", required=True)
    parser.add_argument("--since", type=datetime.fromisoformat, required=True)
    parser.add_argument("--until", type=datetime.fromisoformat, required=True)
    parser.add_argument("--expect-count", type=int, required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    url = make_url(os.environ["DATABASE_URL"])
    if args.baseline_db == url.database or args.since.tzinfo is None or args.until.tzinfo is None or args.until < args.since:
        parser.error("Use a separate baseline database and an ordered, timezone-aware window")
    with psycopg2.connect(url.render_as_string(hide_password=False)) as live, psycopg2.connect(url.set(database=args.baseline_db).render_as_string(hide_password=False)) as baseline:
        baseline.set_session(readonly=True, isolation_level="REPEATABLE READ")
        if args.apply:
            with live.cursor() as cursor:
                cursor.execute("SET LOCAL lock_timeout = '5s'")
                # Compare and apply against one locked state, without losing concurrent edits.
                cursor.execute("LOCK TABLE transactions, transaction_history, transaction_tags IN SHARE ROW EXCLUSIVE MODE")
        else:
            live.set_session(readonly=True, isolation_level="REPEATABLE READ")
        original = read_state(live)
        candidates, excluded = plan_restore(original, read_state(baseline), args.since, args.until)
        print(json.dumps({"eligible": len(candidates), "excluded": excluded, "apply": args.apply}))
        if len(candidates) != args.expect_count:
            raise RuntimeError("Candidate count changed; inspect a fresh dry-run before applying")
        if not args.apply:
            return
        with live.cursor() as cursor:
            execute_batch(cursor, "UPDATE transactions SET updated_at = %s WHERE id = %s AND updated_at IS NOT DISTINCT FROM %s::timestamptz", candidates, page_size=500)
        repaired = read_state(live)
        expected = {tx_id: timestamp for timestamp, tx_id, _ in candidates}
        for tx_id, row in repaired[0].items():
            before = original[0][tx_id]
            if tx_id in expected:
                assert row["updated_at"] == expected[tx_id], "Timestamp verification failed"
                assert {k: v for k, v in row.items() if k != "updated_at"} == {k: v for k, v in before.items() if k != "updated_at"}, "Unexpected data change"
            else:
                assert row == before, "Unplanned row change"
        assert repaired[1:] == original[1:], "Audit history or tags changed"
        print(json.dumps({"verified_restored": len(candidates), "other_fields_unchanged": True}))


if __name__ == "__main__":
    main()
