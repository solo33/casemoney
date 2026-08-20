from datetime import datetime, timedelta, timezone

from app.models.user import User
from tests.conftest import TestingSessionLocal, make_account, register_and_login


def test_finance_insights_return_aggregate_observations(client):
    email = "insights@test.com"
    auth = register_and_login(client, email)
    db = TestingSessionLocal()
    try:
        db.query(User).filter(User.email == email).update({"plan": "family"})
        db.commit()
    finally:
        db.close()
    account = make_account(client, auth)
    category = client.post("/api/categories/", headers=auth, json={"name": "Продукты", "type": "expense"})
    assert category.status_code == 201, category.text
    for payload in (
        {"type": "expense", "amount": 1000, "currency": "RUB", "account_id": account["id"], "category_id": category.json()["id"], "date": (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()},
        {"type": "income", "amount": 3000, "currency": "RUB", "account_id": account["id"], "date": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()},
    ):
        created = client.post("/api/transactions/", headers=auth, json=payload)
        assert created.status_code == 201, created.text

    response = client.post("/api/finance-insights/summary", headers=auth, json={"period_days": 30})

    assert response.status_code == 200
    payload = response.json()
    assert payload["income"] == 3000
    assert payload["expense"] == 1000
    assert len(payload["insights"]) <= 3
    assert all("Продукты" in item["title"] or item["title"] for item in payload["insights"])
