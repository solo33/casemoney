from tests.conftest import make_account, account_balance


def test_transfer_moves_money_between_accounts(client, auth):
    src = make_account(client, auth, name="Источник", balance=1000)
    dst = make_account(client, auth, name="Получатель", balance=0)

    r = client.post("/api/transactions/", headers=auth, json={
        "amount": 400, "type": "transfer", "currency": "RUB",
        "account_id": src["id"], "to_account_id": dst["id"],
    })
    assert r.status_code == 201, r.text

    assert account_balance(client, auth, src["id"]) == 600
    assert account_balance(client, auth, dst["id"]) == 400


def test_transfer_delete_reverts_both_sides(client, auth):
    src = make_account(client, auth, name="Источник", balance=1000)
    dst = make_account(client, auth, name="Получатель", balance=0)
    r = client.post("/api/transactions/", headers=auth, json={
        "amount": 400, "type": "transfer", "currency": "RUB",
        "account_id": src["id"], "to_account_id": dst["id"],
    })
    tx = r.json()
    client.delete(f"/api/transactions/{tx['id']}", headers=auth)
    assert account_balance(client, auth, src["id"]) == 1000
    assert account_balance(client, auth, dst["id"]) == 0


def test_transfer_requires_destination(client, auth):
    src = make_account(client, auth, balance=1000)
    r = client.post("/api/transactions/", headers=auth, json={
        "amount": 100, "type": "transfer", "currency": "RUB", "account_id": src["id"],
    })
    assert r.status_code == 400


def test_change_type_expense_to_transfer(client, auth):
    src = make_account(client, auth, name="Источник", balance=1000)
    dst = make_account(client, auth, name="Получатель", balance=0)
    r = client.post("/api/transactions/", headers=auth, json={
        "amount": 200, "type": "expense", "currency": "RUB", "account_id": src["id"],
    })
    tx = r.json()
    assert account_balance(client, auth, src["id"]) == 800

    # меняем на перевод
    r = client.patch(f"/api/transactions/{tx['id']}", headers=auth, json={
        "type": "transfer", "to_account_id": dst["id"],
    })
    assert r.status_code == 200, r.text
    # расход откатился (+200), затем списание перевода (−200) → источник снова 800
    assert account_balance(client, auth, src["id"]) == 800
    assert account_balance(client, auth, dst["id"]) == 200


def test_transaction_filters_include_matching_transfer_side(client, auth):
    src = make_account(client, auth, name="Source", currency="RUB")
    dst = make_account(client, auth, name="Destination", currency="USD")

    r = client.post("/api/transactions/", headers=auth, json={
        "amount": 1000,
        "type": "transfer",
        "currency": "RUB",
        "account_id": src["id"],
        "to_account_id": dst["id"],
        "to_currency": "USD",
        "to_amount": 10,
    })
    assert r.status_code == 201, r.text

    incoming = client.get(
        "/api/transactions/",
        headers=auth,
        params={"account_id": dst["id"], "currency": "USD"},
    )
    assert incoming.status_code == 200
    assert incoming.json()["total"] == 1

    wrong_side = client.get(
        "/api/transactions/",
        headers=auth,
        params={"account_id": src["id"], "currency": "USD"},
    )
    assert wrong_side.status_code == 200
    assert wrong_side.json()["total"] == 0
