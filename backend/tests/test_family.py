from tests.conftest import make_account, register_and_login


def test_family_expense_is_shared_without_exposing_personal_transactions(client):
    owner = register_and_login(client, "owner-family@test.com")
    member = register_and_login(client, "member-family@test.com")

    created = client.post(
        "/api/family/",
        headers=owner,
        json={"name": "Наша семья"},
    )
    assert created.status_code == 201, created.text

    invited = client.post(
        "/api/family/invite",
        headers=owner,
        json={"email": "member-family@test.com"},
    )
    assert invited.status_code == 201, invited.text
    invitation_id = invited.json()["id"]
    accepted = client.post(
        f"/api/family/invitations/{invitation_id}/accept",
        headers=member,
    )
    assert accepted.status_code == 200, accepted.text

    account = make_account(client, member, name="Личная карта", balance=10000)
    personal = client.post(
        "/api/transactions/",
        headers=member,
        json={
            "amount": 100,
            "type": "expense",
            "currency": "RUB",
            "account_id": account["id"],
            "description": "Личное",
        },
    )
    assert personal.status_code == 201, personal.text
    shared = client.post(
        "/api/transactions/",
        headers=member,
        json={
            "amount": 1200,
            "type": "expense",
            "currency": "RUB",
            "account_id": account["id"],
            "description": "Продукты",
            "is_family_expense": True,
            "reimbursement_amount": 800,
        },
    )
    assert shared.status_code == 201, shared.text
    assert shared.json()["is_family_expense"] is True

    report = client.get("/api/family/report", headers=owner)
    assert report.status_code == 200, report.text
    data = report.json()
    assert [item["description"] for item in data["expenses"]] == ["Продукты"]
    assert len(data["outstanding"]) == 1
    assert data["outstanding"][0]["user_id"] == shared.json()["user_id"]
    assert data["outstanding"][0]["currency"] == "RUB"
    assert data["outstanding"][0]["amount"] == 800


def test_settlement_reduces_outstanding_without_creating_expense(client):
    owner = register_and_login(client, "payer@test.com")
    member = register_and_login(client, "recipient@test.com")
    family = client.post(
        "/api/family/", headers=owner, json={"name": "Семья"}
    )
    assert family.status_code == 201
    invitation = client.post(
        "/api/family/invite",
        headers=owner,
        json={"email": "recipient@test.com"},
    ).json()
    accepted = client.post(
        f"/api/family/invitations/{invitation['id']}/accept", headers=member
    )
    recipient_id = next(
        item["user_id"]
        for item in accepted.json()["members"]
        if item["email"] == "recipient@test.com"
    )
    account = make_account(client, member, balance=5000)
    tx = client.post(
        "/api/transactions/",
        headers=member,
        json={
            "amount": 1000,
            "type": "expense",
            "currency": "RUB",
            "account_id": account["id"],
            "is_family_expense": True,
        },
    )
    assert tx.status_code == 201, tx.text

    settlement = client.post(
        "/api/family/settlements",
        headers=owner,
        json={
            "to_user_id": recipient_id,
            "amount": 400,
            "currency": "RUB",
            "description": "Частичное возмещение",
        },
    )
    assert settlement.status_code == 201, settlement.text
    report = client.get("/api/family/report", headers=owner).json()
    assert report["outstanding"][0]["amount"] == 600
    assert report["totals"] == [{"currency": "RUB", "amount": 1000}]
