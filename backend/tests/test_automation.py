from datetime import datetime, timedelta, timezone

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


def test_category_suggestion_uses_history_and_never_changes_form_data(client, auth):
    account = make_account(client, auth)
    food = _expense_category(client, auth)
    for amount in (100, 200):
        response = client.post("/api/transactions/", headers=auth, json={
            "type": "expense", "amount": amount, "currency": "RUB",
            "account_id": account["id"], "category_id": food["id"],
            "description": "Пятёрочка у дома",
        })
        assert response.status_code == 201, response.text

    response = client.get("/api/automation/category-suggestion", headers=auth, params={
        "description": "  ПЯТЁРОЧКА  У ДОМА ", "transaction_type": "expense",
    })
    assert response.status_code == 200, response.text
    assert response.json()["category_id"] == food["id"]
    assert response.json()["source"] == "history"
    assert response.json()["matching_operations"] == 2
    assert client.get("/api/transactions/", headers=auth).json()["total"] == 2


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


def test_automation_settings_can_disable_rules_and_duplicate_review(client, auth):
    account = make_account(client, auth)
    food = _expense_category(client, auth)
    client.post("/api/automation/rules", headers=auth, json={"pattern": "Пятёрочка", "category_id": food["id"]})

    settings = client.patch(
        "/api/automation/settings",
        headers=auth,
        json={"rules_enabled": False, "duplicates_enabled": False},
    )
    assert settings.status_code == 200, settings.text
    assert settings.json() == {"rules_enabled": False, "duplicates_enabled": False}

    payload = {"type": "expense", "amount": 100, "currency": "RUB", "account_id": account["id"], "description": "Пятёрочка"}
    response = client.post("/api/transactions/", headers=auth, json=payload)
    assert response.status_code == 201, response.text
    assert response.json()["category_id"] is None
    assert client.get("/api/automation/duplicates", headers=auth).json() == []


def test_regular_payment_suggestions_are_read_only(client, auth):
    account = make_account(client, auth)
    food = _expense_category(client, auth)
    first = datetime(2026, 5, 3, tzinfo=timezone.utc)
    for index in range(3):
        response = client.post("/api/transactions/", headers=auth, json={
            "type": "expense", "amount": 799, "currency": "RUB",
            "account_id": account["id"], "category_id": food["id"],
            "description": "Музыкальная подписка",
            "date": (first + timedelta(days=index * 30)).isoformat(),
        })
        assert response.status_code == 201, response.text

    response = client.get("/api/automation/regular-payments", headers=auth)
    assert response.status_code == 200, response.text
    assert len(response.json()) == 1
    item = response.json()[0]
    assert item["cadence"] == "ежемесячно"
    assert item["category_name"] == "Продукты"
    assert client.get("/api/transactions/", headers=auth).json()["total"] == 3
