from .conftest import make_account


def test_tags_can_be_created_attached_filtered_and_reported(client, auth):
    account = make_account(client, auth)
    trip = client.post("/api/tags/", headers=auth, json={"name": "Поездка", "color": "#2f6296"})
    repair = client.post("/api/tags/", headers=auth, json={"name": "Ремонт"})
    assert trip.status_code == repair.status_code == 201

    expense = client.post("/api/transactions/", headers=auth, json={
        "type": "expense", "amount": 1250, "currency": "RUB", "account_id": account["id"],
        "description": "Билеты", "tag_ids": [trip.json()["id"], repair.json()["id"]],
    })
    assert expense.status_code == 201, expense.text
    assert {tag["name"] for tag in expense.json()["tags"]} == {"Поездка", "Ремонт"}

    filtered = client.get(f"/api/transactions/?tag_id={trip.json()['id']}", headers=auth)
    assert filtered.status_code == 200, filtered.text
    assert filtered.json()["total"] == 1

    report = client.get(f"/api/tags/{trip.json()['id']}/report", headers=auth)
    assert report.status_code == 200, report.text
    assert report.json()["totals"] == [{"type": "expense", "currency": "RUB", "amount": 1250.0}]


def test_user_cannot_attach_someone_elses_tag(client, auth):
    own_tag = client.post("/api/tags/", headers=auth, json={"name": "Личное"}).json()
    from .conftest import register_and_login
    other_auth = register_and_login(client)
    other_account = make_account(client, other_auth, name="Другой счёт")
    blocked = client.post("/api/transactions/", headers=other_auth, json={
        "type": "expense", "amount": 1, "currency": "RUB", "account_id": other_account["id"],
        "tag_ids": [own_tag["id"]],
    })
    assert blocked.status_code == 400
