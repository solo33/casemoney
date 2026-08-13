from datetime import date

import pytest

from app.services.recurring_transactions import _next_occurrence


@pytest.mark.parametrize(
    ("current", "frequency", "expected"),
    [
        (date(2026, 8, 10), "daily", date(2026, 8, 11)),
        (date(2026, 8, 10), "weekly", date(2026, 8, 17)),
        (date(2026, 8, 10), "biweekly", date(2026, 8, 24)),
        (date(2026, 1, 31), "monthly", date(2026, 2, 28)),
        (date(2024, 2, 29), "yearly", date(2025, 2, 28)),
    ],
)
def test_next_occurrence_uses_expected_period(current, frequency, expected):
    assert _next_occurrence(current, frequency) == expected
