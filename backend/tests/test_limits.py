from tests.conftest import make_account


def test_free_account_limit(client, auth):
    # Free-тариф: 3 счёта. Четвёртый → 402.
    for i in range(3):
        make_account(client, auth, name=f"Счёт {i}")
    r = client.post("/api/accounts/", headers=auth, json={
        "name": "Лишний", "type": "cash", "initial_currency": "RUB", "initial_balance": 0,
    })
    assert r.status_code == 402, r.text
