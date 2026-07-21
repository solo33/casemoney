from tests.conftest import make_account, account_balance


def _add(client, auth, account_id, amount, type_, currency="RUB", category_id=None):
    payload = {"amount": amount, "type": type_, "currency": currency, "account_id": account_id}
    if category_id:
        payload["category_id"] = category_id
    r = client.post("/api/transactions/", headers=auth, json=payload)
    assert r.status_code == 201, r.text
    return r.json()


def test_expense_and_income_move_balance(client, auth):
    acc = make_account(client, auth, balance=1000)
    _add(client, auth, acc["id"], 300, "expense")
    assert account_balance(client, auth, acc["id"]) == 700
    _add(client, auth, acc["id"], 200, "income")
    assert account_balance(client, auth, acc["id"]) == 900


def test_create_is_idempotent(client, auth):
    acc = make_account(client, auth, balance=1000)
    headers = {**auth, "Idempotency-Key": "same-financial-operation"}
    payload = {
        "amount": 300,
        "type": "expense",
        "currency": "RUB",
        "account_id": acc["id"],
    }

    first = client.post("/api/transactions/", headers=headers, json=payload)
    repeated = client.post("/api/transactions/", headers=headers, json=payload)

    assert first.status_code == 201, first.text
    assert repeated.status_code == 201, repeated.text
    assert repeated.json()["id"] == first.json()["id"]
    assert account_balance(client, auth, acc["id"]) == 700


def test_idempotency_key_rejects_changed_payload(client, auth):
    acc = make_account(client, auth, balance=1000)
    headers = {**auth, "Idempotency-Key": "reused-with-other-data"}
    base = {
        "amount": 100,
        "type": "expense",
        "currency": "RUB",
        "account_id": acc["id"],
    }
    assert client.post("/api/transactions/", headers=headers, json=base).status_code == 201

    changed = {**base, "amount": 200}
    response = client.post("/api/transactions/", headers=headers, json=changed)

    assert response.status_code == 409
    assert account_balance(client, auth, acc["id"]) == 900


def test_delete_reverts_balance(client, auth):
    acc = make_account(client, auth, balance=1000)
    tx = _add(client, auth, acc["id"], 250, "expense")
    assert account_balance(client, auth, acc["id"]) == 750
    r = client.delete(f"/api/transactions/{tx['id']}", headers=auth)
    assert r.status_code == 204
    assert account_balance(client, auth, acc["id"]) == 1000


def test_cross_currency_transfer_uses_explicit_destination_amount(client, auth):
    source = make_account(client, auth, name="Source", balance=1000, currency="RUB")
    target = make_account(client, auth, name="Target", balance=20, currency="EUR")
    response = client.post("/api/transactions/", headers=auth, json={
        "amount": 500,
        "type": "transfer",
        "currency": "RUB",
        "account_id": source["id"],
        "to_account_id": target["id"],
        "to_amount": 5.25,
        "to_currency": "EUR",
    })

    assert response.status_code == 201, response.text
    assert response.json()["to_amount"] == 5.25
    assert response.json()["to_currency"] == "EUR"
    assert account_balance(client, auth, source["id"], "RUB") == 500
    assert account_balance(client, auth, target["id"], "EUR") == 25.25


def test_user_currency_conversion_preview(client, auth, monkeypatch):
    monkeypatch.setattr(
        "app.api.currencies.exchange_svc.get_rate_for_user",
        lambda db, user_id, source, target: (0.0125, "manual"),
    )

    response = client.get(
        "/api/currencies/convert",
        headers=auth,
        params={"amount": 800, "from": "RUB", "to": "EUR"},
    )

    assert response.status_code == 200, response.text
    assert response.json() == {
        "from_currency": "RUB",
        "to_currency": "EUR",
        "amount": 800.0,
        "converted": 10.0,
        "rate": 0.0125,
        "source": "manual",
    }


def test_edit_amount_recomputes_balance(client, auth):
    acc = make_account(client, auth, balance=1000)
    tx = _add(client, auth, acc["id"], 100, "expense")
    assert account_balance(client, auth, acc["id"]) == 900
    r = client.patch(f"/api/transactions/{tx['id']}", headers=auth, json={"amount": 400})
    assert r.status_code == 200
    assert account_balance(client, auth, acc["id"]) == 600


def test_history_records_events(client, auth):
    acc = make_account(client, auth, balance=1000)
    tx = _add(client, auth, acc["id"], 100, "expense")
    client.patch(f"/api/transactions/{tx['id']}", headers=auth, json={"amount": 150})
    client.delete(f"/api/transactions/{tx['id']}", headers=auth)
    r = client.get("/api/transactions/history", headers=auth)
    assert r.status_code == 200
    actions = [h["action"] for h in r.json()["items"]]
    assert "created" in actions and "edited" in actions and "deleted" in actions
