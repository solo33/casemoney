from tests.conftest import register_and_login


def test_personal_has_no_account_limit(client):
    # Personal: текущие функции доступны без ограничений.
    auth = register_and_login(client)

    r = client.get("/api/accounts/", headers=auth)
    assert r.status_code == 200
    assert len(r.json()) == 3  # стартовые счета

    r = client.post("/api/accounts/", headers=auth, json={
        "name": "Дополнительный", "type": "cash", "initial_currency": "RUB", "initial_balance": 0,
    })
    assert r.status_code == 201, r.text

    r = client.get("/api/me/limits", headers=auth)
    assert r.status_code == 200
    assert r.json()["plan"] == "personal"
    assert r.json()["limits"] is None
