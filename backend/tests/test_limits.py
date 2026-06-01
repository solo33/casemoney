from tests.conftest import register_and_login


def test_free_account_limit(client):
    # Free-тариф: лимит 3 счёта. При регистрации уже создаётся 3 стартовых
    # счёта (Кошелёк / Карта / Вклад) — значит свободный пользователь сразу
    # на лимите и не может создать ещё один.
    auth = register_and_login(client, premium=False)

    r = client.get("/api/accounts/", headers=auth)
    assert r.status_code == 200
    assert len(r.json()) == 3  # стартовые счета

    r = client.post("/api/accounts/", headers=auth, json={
        "name": "Лишний", "type": "cash", "initial_currency": "RUB", "initial_balance": 0,
    })
    assert r.status_code == 402, r.text
