from tests.conftest import register_and_login, make_account


def test_registration_seeds_default_groups_and_accounts(client):
    auth = register_and_login(client)
    r = client.get("/api/accounts/grouped", headers=auth)
    assert r.status_code == 200
    buckets = r.json()
    names = [b["group"]["name"] for b in buckets]
    assert "Наличные" in names
    assert "Счета в банках" in names
    assert "Депозиты" in names
    # по одному счёту в каждой стартовой группе
    for b in buckets:
        if b["group"]["name"] in ("Наличные", "Счета в банках", "Депозиты"):
            assert len(b["accounts"]) == 1


def test_create_and_list_account(client, auth):
    acc = make_account(client, auth, name="Карта", balance=1000)
    assert acc["name"] == "Карта"
    r = client.get("/api/accounts/", headers=auth)
    assert r.status_code == 200
    assert any(a["id"] == acc["id"] for a in r.json())


def test_grouped_accounts_can_skip_currency_conversion(client, auth, monkeypatch):
    acc = make_account(client, auth, name="USD card", balance=100, currency="USD")

    def must_not_convert(*args, **kwargs):
        raise AssertionError("lightweight account options must not request exchange rates")

    monkeypatch.setattr("app.services.accounts.exchange_svc.convert_for_user", must_not_convert)
    r = client.get("/api/accounts/grouped?convert_balances=false", headers=auth)

    assert r.status_code == 200, r.text
    listed = [a for bucket in r.json() for a in bucket["accounts"]]
    account = next(a for a in listed if a["id"] == acc["id"])
    assert account["balances"][0]["balance"] == 100
    assert account["balances"][0]["balance_in_main"] == 0


def test_account_balances_list_rub_first(client, auth):
    acc = make_account(client, auth, name="Multi", balance=100, currency="USD")
    response = client.post(
        f"/api/accounts/{acc['id']}/balances",
        headers=auth,
        json={"currency": "RUB", "balance": 500},
    )
    assert response.status_code == 201, response.text

    response = client.get(
        "/api/accounts/grouped?convert_balances=false",
        headers=auth,
    )
    assert response.status_code == 200, response.text
    listed = [a for bucket in response.json() for a in bucket["accounts"]]
    account = next(a for a in listed if a["id"] == acc["id"])
    assert [balance["currency"] for balance in account["balances"]] == ["RUB", "USD"]


def test_account_isolation_between_users(client):
    auth_a = register_and_login(client)
    auth_b = register_and_login(client)
    acc = make_account(client, auth_a, name="A-счёт")

    # B не видит счёт A в своём списке
    rb = client.get("/api/accounts/", headers=auth_b)
    assert all(a["id"] != acc["id"] for a in rb.json())

    # B не может изменить чужой счёт
    r = client.put(f"/api/accounts/{acc['id']}", headers=auth_b, json={"name": "ugh"})
    assert r.status_code == 404

    # B не может удалить чужой счёт
    r = client.delete(f"/api/accounts/{acc['id']}", headers=auth_b)
    assert r.status_code == 404


def test_include_in_balance_excluded_from_total(client, auth):
    make_account(client, auth, name="В балансе", balance=1000, include_in_balance=True)
    make_account(client, auth, name="Вне баланса", balance=500, include_in_balance=False)
    r = client.get("/api/dashboard/", headers=auth)
    assert r.status_code == 200
    assert r.json()["total_balance"] == 1000
