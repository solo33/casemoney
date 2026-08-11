from tests.conftest import TestingSessionLocal, make_account, register_and_login
from app.models.user import User


def enable_family_plan(email: str) -> None:
    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.email == email).one()
        user.plan = "family"
        db.commit()
    finally:
        db.close()


def test_personal_plan_cannot_use_family_features(client):
    auth = register_and_login(client, "personal-family@test.com")

    response = client.post(
        "/api/family/",
        headers=auth,
        json={"name": "Недоступная семья"},
    )
    assert response.status_code == 403

    account = make_account(client, auth, balance=1000)
    transaction = client.post(
        "/api/transactions/",
        headers=auth,
        json={
            "type": "expense",
            "amount": 100,
            "currency": "RUB",
            "account_id": account["id"],
            "is_family_expense": True,
        },
    )
    assert transaction.status_code == 403


def test_family_expense_is_shared_without_exposing_personal_transactions(client):
    owner = register_and_login(client, "owner-family@test.com")
    member = register_and_login(client, "member-family@test.com")
    enable_family_plan("owner-family@test.com")
    enable_family_plan("member-family@test.com")

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
    notifications = client.get("/api/notifications/", headers=member).json()
    assert notifications["unread_count"] == 1
    assert notifications["items"][0]["title"] == "Приглашение в семейное пространство"
    assert notifications["items"][0]["link"] == "/settings/family"
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
    enable_family_plan("payer@test.com")
    enable_family_plan("recipient@test.com")
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
