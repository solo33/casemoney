from app.models.transaction import Transaction

from .conftest import make_account


def _expense_category(client, auth, name="Продукты"):
    response = client.post("/api/categories/", headers=auth, json={"name": name, "type": "expense"})
    assert response.status_code == 201, response.text
    return response.json()


def test_category_rule_classifies_only_empty_category(client, auth):
    account = make_account(client, auth)
    food = _expense_category(client, auth)
    created = client.post("/api/automation/rules", headers=auth, json={"pattern": "Пятёрочка", "category_id": food["id"]})
    assert created.status_code == 201, created.text

    response = client.post("/api/transactions/", headers=auth, json={
        "type": "expense", "amount": 500, "currency": "RUB", "account_id": account["id"], "description": "ПЯТЁРОЧКА у дома",
    })
    assert response.status_code == 201, response.text
    assert response.json()["category_id"] == food["id"]

    other = _expense_category(client, auth, "Дом")
    explicit = client.post("/api/transactions/", headers=auth, json={
        "type": "expense", "amount": 300, "currency": "RUB", "account_id": account["id"], "description": "Пятёрочка", "category_id": other["id"],
    })
    assert explicit.status_code == 201, explicit.text
    assert explicit.json()["category_id"] == other["id"]


def test_duplicate_endpoint_never_modifies_transactions(client, auth):
    account = make_account(client, auth)
    payload = {"type": "expense", "amount": 100, "currency": "RUB", "account_id": account["id"], "description": "Кофе"}
    first = client.post("/api/transactions/", headers=auth, json=payload)
    second = client.post("/api/transactions/", headers=auth, json=payload)
    assert first.status_code == second.status_code == 201

    response = client.get("/api/automation/duplicates", headers=auth)
    assert response.status_code == 200, response.text
    assert len(response.json()) == 1
    assert len(response.json()[0]["transactions"]) == 2


def test_expense_rule_is_not_applied_to_income(client, auth):
    account = make_account(client, auth)
    food = _expense_category(client, auth)
    client.post("/api/automation/rules", headers=auth, json={"pattern": "Возврат", "category_id": food["id"]})
    response = client.post("/api/transactions/", headers=auth, json={
        "type": "income", "amount": 100, "currency": "RUB", "account_id": account["id"], "description": "Возврат покупки",
    })
    assert response.status_code == 201, response.text
    assert response.json()["category_id"] is None
