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


def test_delete_reverts_balance(client, auth):
    acc = make_account(client, auth, balance=1000)
    tx = _add(client, auth, acc["id"], 250, "expense")
    assert account_balance(client, auth, acc["id"]) == 750
    r = client.delete(f"/api/transactions/{tx['id']}", headers=auth)
    assert r.status_code == 204
    assert account_balance(client, auth, acc["id"]) == 1000


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
