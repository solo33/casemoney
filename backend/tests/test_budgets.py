from datetime import datetime, timedelta, timezone

from tests.conftest import TestingSessionLocal, make_account, register_and_login
from app.models.user import User


def enable_family_plan(email: str) -> None:
    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.email == email).one()
        user.plan = "family"
        db.commit()
    finally:
        db.close()


def get_category_id(client, auth, name, type_="expense"):
    categories = client.get("/api/categories/", headers=auth).json()
    match = next(c for c in categories if c["name"] == name and c["type"] == type_)
    return match["id"]


def test_personal_plan_cannot_use_budgets(client):
    auth = register_and_login(client, "personal-budget@test.com")
    response = client.get("/api/budgets/", headers=auth)
    assert response.status_code == 403


def test_create_budget_and_track_spending(client):
    auth = register_and_login(client, "owner-budget@test.com")
    enable_family_plan("owner-budget@test.com")
    account = make_account(client, auth, balance=100000)
    category_id = get_category_id(client, auth, "Продукты")

    created = client.post("/api/budgets/", headers=auth, json={
        "category_id": category_id, "amount": 10000, "currency": "RUB",
    })
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["spent"] == 0
    assert body["remaining"] == 10000
    assert body["is_overspent"] is False

    duplicate = client.post("/api/budgets/", headers=auth, json={
        "category_id": category_id, "amount": 5000, "currency": "RUB",
    })
    assert duplicate.status_code == 400

    tx = client.post("/api/transactions/", headers=auth, json={
        "type": "expense", "amount": 12000, "currency": "RUB",
        "account_id": account["id"], "category_id": category_id,
    })
    assert tx.status_code == 201, tx.text

    listed = client.get("/api/budgets/", headers=auth).json()
    assert len(listed) == 1
    assert listed[0]["spent"] == 12000
    assert listed[0]["remaining"] == -2000
    assert listed[0]["is_overspent"] is True

    updated = client.patch(f"/api/budgets/{body['id']}", headers=auth, json={"amount": 15000})
    assert updated.status_code == 200
    assert updated.json()["is_overspent"] is False

    deleted = client.delete(f"/api/budgets/{body['id']}", headers=auth)
    assert deleted.status_code == 204
    assert client.get("/api/budgets/", headers=auth).json() == []


def test_cannot_budget_income_category(client):
    auth = register_and_login(client, "owner-budget-income@test.com")
    enable_family_plan("owner-budget-income@test.com")
    category_id = get_category_id(client, auth, "Зарплата", type_="income")
    response = client.post("/api/budgets/", headers=auth, json={
        "category_id": category_id, "amount": 1000, "currency": "RUB",
    })
    assert response.status_code == 400


def test_suggestions_use_past_six_months_average(client):
    auth = register_and_login(client, "owner-budget-suggest@test.com")
    enable_family_plan("owner-budget-suggest@test.com")
    account = make_account(client, auth, balance=100000)
    category_id = get_category_id(client, auth, "Кафе и рестораны")

    now = datetime.now(timezone.utc)
    for months_ago in (1, 2, 3):
        tx_date = now - timedelta(days=30 * months_ago)
        response = client.post("/api/transactions/", headers=auth, json={
            "type": "expense", "amount": 3000, "currency": "RUB",
            "account_id": account["id"], "category_id": category_id,
            "date": tx_date.isoformat(),
        })
        assert response.status_code == 201, response.text

    # Расход в текущем месяце не должен влиять на подсказку (только прошлые месяцы).
    current = client.post("/api/transactions/", headers=auth, json={
        "type": "expense", "amount": 999999, "currency": "RUB",
        "account_id": account["id"], "category_id": category_id,
    })
    assert current.status_code == 201, current.text

    suggestions = client.get("/api/budgets/suggestions", headers=auth).json()
    match = next(s for s in suggestions if s["category_id"] == category_id)
    assert match["average_amount"] == 3000
    assert match["months_with_data"] == 3

    # После создания бюджета категория пропадает из подсказок.
    client.post("/api/budgets/", headers=auth, json={
        "category_id": category_id, "amount": 3000, "currency": "RUB",
    })
    suggestions_after = client.get("/api/budgets/suggestions", headers=auth).json()
    assert all(s["category_id"] != category_id for s in suggestions_after)
