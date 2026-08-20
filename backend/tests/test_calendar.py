from datetime import date, timedelta

from app.models.user import User
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
