from datetime import date, timedelta

from app.models.user import User
from app.models.recurring_transaction import RecurringTransactionRun
from tests.conftest import TestingSessionLocal, make_account, register_and_login


def _enable_family(email: str) -> None:
    db = TestingSessionLocal()
    try:
        db.query(User).filter(User.email == email).update({"plan": "family"})
        db.commit()
    finally:
        db.close()


def test_private_icalendar_feed_contains_planned_and_recurring_operations(client):
    email = "calendar-owner@test.com"
    auth = register_and_login(client, email)
    _enable_family(email)
    account = make_account(client, auth)
    future = date.today() + timedelta(days=4)
    planned = client.post("/api/transactions/", headers=auth, json={
        "type": "expense", "amount": 1200, "currency": "RUB", "account_id": account["id"],
        "description": "Оплата интернета", "date": f"{future.isoformat()}T12:00:00", "is_planned": True,
    })
    assert planned.status_code == 201, planned.text
    recurring = client.post("/api/recurring-transactions/", headers=auth, json={
        "name": "Зарплата", "type": "income", "amount": 100000, "currency": "RUB",
        "account_id": account["id"], "frequency": "monthly", "next_date": future.isoformat(),
    })
    assert recurring.status_code == 201, recurring.text

    subscription = client.get("/api/calendar/subscription", headers=auth)
    assert subscription.status_code == 200
    url = subscription.json()["url"]
    token = url.rsplit("/", 1)[-1].removesuffix(".ics")

    feed = client.get(f"/api/calendar/feed/{token}.ics")
    assert feed.status_code == 200
    assert feed.headers["content-type"].startswith("text/calendar")
    assert "Оплата интернета" in feed.text
    assert "Зарплата" in feed.text
    assert "RRULE:FREQ=MONTHLY" in feed.text


def test_rotating_calendar_link_invalidates_old_feed(client):
    email = "calendar-rotate@test.com"
    auth = register_and_login(client, email)
    _enable_family(email)
    first = client.get("/api/calendar/subscription", headers=auth).json()["url"]
    second = client.post("/api/calendar/subscription/rotate", headers=auth).json()["url"]
    assert first != second
    old_token = first.rsplit("/", 1)[-1].removesuffix(".ics")
    new_token = second.rsplit("/", 1)[-1].removesuffix(".ics")
    assert client.get(f"/api/calendar/feed/{old_token}.ics").status_code == 404
    assert client.get(f"/api/calendar/feed/{new_token}.ics").status_code == 200


def test_upcoming_events_deduplicate_generated_recurrence_and_include_obligation(client):
    email = "calendar-events@test.com"
    auth = register_and_login(client, email)
    _enable_family(email)
    account = make_account(client, auth)
    future = date.today() + timedelta(days=7)

    planned = client.post("/api/transactions/", headers=auth, json={
        "type": "expense", "amount": 1200, "currency": "RUB", "account_id": account["id"],
        "description": "Интернет", "date": f"{future.isoformat()}T12:00:00", "is_planned": True,
    })
    assert planned.status_code == 201, planned.text
    recurring = client.post("/api/recurring-transactions/", headers=auth, json={
        "name": "Интернет", "type": "expense", "amount": 1200, "currency": "RUB",
        "account_id": account["id"], "frequency": "monthly", "next_date": future.isoformat(),
    })
    assert recurring.status_code == 201, recurring.text
    credit = client.post("/api/credits/", headers=auth, json={
        "name": "Кредит", "kind": "loan", "currency": "RUB", "current_balance": 10000,
        "monthly_payment": 1500, "next_payment_date": future.isoformat(), "source_account_id": account["id"],
    })
    assert credit.status_code == 201, credit.text

    db = TestingSessionLocal()
    try:
        db.add(RecurringTransactionRun(
            recurring_transaction_id=recurring.json()["id"], scheduled_for=future,
            status="planned", transaction_id=planned.json()["id"],
        ))
        db.commit()
    finally:
        db.close()

    response = client.get("/api/calendar/events", headers=auth)
    assert response.status_code == 200, response.text
    events = response.json()
    assert [item["source"] for item in events].count("planned") == 1
    assert not any(item["source"] == "recurring" and item["title"] == "Интернет" for item in events)
    assert any(item["source"] == "obligation" and item["title"] == "Кредит" for item in events)
