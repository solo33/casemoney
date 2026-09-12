from copy import deepcopy
from datetime import datetime

from scripts.restore_snapshot_timestamps import plan_restore


def test_recovery_excludes_real_edits_new_rows_tags_and_unrelated_updates():
    old = {i: {"id": i, "user_id": 1, "amount": 100, "updated_at": "2024-01-01T00:00:00+00:00"} for i in range(1, 8)}
    current = deepcopy(old)
    for row in current.values():
        row.update(updated_at="2026-09-11T03:59:00+00:00", valuation_currency="RUB", exchange_rate=1)
    current[2]["amount"] = 200
    current[5]["updated_at"] = "2026-09-12T00:00:00+00:00"
    current[6]["exchange_rate"] = None
    current[8] = {**current[1], "id": 8}
    old[7].update(valuation_currency="RUB", exchange_rate=1)
    plan, excluded = plan_restore(
        (current, {3: 11}, {4: [2]}), (old, {3: 10}, {}),
        datetime.fromisoformat("2026-09-11T03:58:00+00:00"),
        datetime.fromisoformat("2026-09-11T04:00:00+00:00"),
    )
    assert plan == [(old[1]["updated_at"], 1, current[1]["updated_at"])]
    assert sum(excluded.values()) == 7
    assert excluded["changed_history_or_tags"] == 2
