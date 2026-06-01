from tests.conftest import register_and_login, make_account


def test_create_and_list_account(client, auth):
    acc = make_account(client, auth, name="Карта", balance=1000)
    assert acc["name"] == "Карта"
    r = client.get("/api/accounts/", headers=auth)
    assert r.status_code == 200
    assert any(a["id"] == acc["id"] for a in r.json())


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
