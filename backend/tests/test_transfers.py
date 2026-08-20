from app.models.user import User
from app.services.auth import decode_token
from tests.conftest import TestingSessionLocal, make_account, account_balance


def _annual_account(report, account_id):
    """Находит строку нужного счёта в ответе годовых балансов."""
    for group in report["groups"]:
        for account in group["accounts"]:
            if account["account_id"] == account_id:
                return account
    raise AssertionError(f"Счёт {account_id} отсутствует в отчёте")


def _enable_family_plan(auth):
    user_id = int(decode_token(auth["Authorization"].split(" ", 1)[1])["sub"])
    db = TestingSessionLocal()
    try:
        db.get(User, user_id).plan = "family"
        db.commit()
    finally:
        db.close()


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


def test_annual_balances_reflect_transfer_on_both_accounts(client, auth):
    _enable_family_plan(auth)
    source = make_account(client, auth, name="Источник", balance=1000)
    target = make_account(client, auth, name="Получатель", balance=0)

    response = client.post("/api/transactions/", headers=auth, json={
        "amount": 300, "type": "transfer", "currency": "RUB",
        "account_id": source["id"], "to_account_id": target["id"],
        "date": "2026-03-15T12:00:00Z",
    })
    assert response.status_code == 201, response.text

    response = client.get("/api/reports/annual-balances?year=2026", headers=auth)
    assert response.status_code == 200, response.text
    report = response.json()

    assert _annual_account(report, source["id"])["monthly"] == [1000, 1000] + [700] * 10
    assert _annual_account(report, target["id"])["monthly"] == [0, 0] + [300] * 10


def test_annual_balances_use_destination_currency_and_amount_for_transfer(client, auth, monkeypatch):
    _enable_family_plan(auth)
    source = make_account(client, auth, name="RUB", balance=1000, currency="RUB")
    target = make_account(client, auth, name="USD", balance=0, currency="USD")
    # Для теста истории счёта важны сама валюта и сумма зачисления, а не внешний курс.
    monkeypatch.setattr("app.api.reports._to_main", lambda _db, _uid, amount, *_args: amount)

    response = client.post("/api/transactions/", headers=auth, json={
        "amount": 500, "type": "transfer", "currency": "RUB",
        "account_id": source["id"], "to_account_id": target["id"],
        "to_currency": "USD", "to_amount": 5,
        "date": "2026-05-15T12:00:00Z",
    })
    assert response.status_code == 201, response.text

    report = client.get("/api/reports/annual-balances?year=2026", headers=auth).json()
    assert _annual_account(report, source["id"])["monthly"] == [1000] * 4 + [500] * 8
    assert _annual_account(report, target["id"])["monthly"] == [0] * 4 + [5] * 8


def test_annual_balances_exclude_planned_operations(client, auth):
    _enable_family_plan(auth)
    account = make_account(client, auth, name="Фактический", balance=1000)
    response = client.post("/api/transactions/", headers=auth, json={
        "amount": 250, "type": "expense", "currency": "RUB", "account_id": account["id"],
        "date": "2026-07-15T12:00:00Z", "is_planned": True,
    })
    assert response.status_code == 201, response.text
    assert account_balance(client, auth, account["id"]) == 1000

    report = client.get("/api/reports/annual-balances?year=2026", headers=auth).json()
    assert _annual_account(report, account["id"])["monthly"] == [1000] * 12
