from datetime import date, datetime, timezone

from tests.conftest import TestingSessionLocal, enable_billing, make_account, register_and_login
from app.models.transaction import Transaction
from app.models.user import User
from app.services.recurring_transactions import process_recurring_transactions


def enable_family_plan(email: str) -> None:
    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.email == email).one()
        user.plan = "family"
        db.commit()
    finally:
        db.close()


def test_personal_plan_cannot_use_family_features(client):
    enable_billing()
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


def test_family_features_are_free_when_billing_disabled(client):
    """Launch mode (default): a plain personal-plan user still gets Family for free."""
    auth = register_and_login(client, "free-launch@test.com")

    me = client.get("/api/me/", headers=auth).json()
    assert me["plan"] == "personal"
    assert me["family_access"] is True

    created = client.post("/api/family/", headers=auth, json={"name": "Бесплатная семья"})
    assert created.status_code == 201, created.text


def test_registration_saves_selected_mode_and_mode_can_be_changed(client):
    response = client.post("/api/auth/register", json={
        "email": "chosen-family@test.com",
        "username": "chosen-family",
        "password": "secret123",
        "preferred_mode": "family",
    })
    assert response.status_code == 200, response.text
    auth = {"Authorization": f"Bearer {response.json()['access_token']}"}
    assert client.get("/api/me/", headers=auth).json()["preferred_mode"] == "family"

    changed = client.put("/api/me/", headers=auth, json={"preferred_mode": "personal"})
    assert changed.status_code == 200, changed.text
    assert changed.json()["preferred_mode"] == "personal"


def test_free_launch_has_no_family_member_cap(client):
    owner = register_and_login(client, "unlimited-owner@test.com")
    client.post("/api/family/", headers=owner, json={"name": "Без лимита"})
    for i in range(5):
        result = client.post("/api/family/invite", headers=owner, json={"email": f"unlimited-{i}@test.com"})
        assert result.status_code == 201, result.text


def test_paid_owner_subscription_grants_family_access_to_invitee(client):
    enable_billing()
    owner = register_and_login(client, "paid-owner@test.com")
    member = register_and_login(client, "paid-member@test.com")
    enable_family_plan("paid-owner@test.com")
    client.post("/api/family/", headers=owner, json={"name": "Оплаченная семья"})
    invitation = client.post(
        "/api/family/invite", headers=owner, json={"email": "paid-member@test.com"}
    ).json()
    accepted = client.post(f"/api/family/invitations/{invitation['id']}/accept", headers=member)
    assert accepted.status_code == 200, accepted.text
    assert client.get("/api/me/", headers=member).json()["family_access"] is True


def test_family_invite_respects_member_cap(client):
    enable_billing()
    owner = register_and_login(client, "cap-owner@test.com")
    enable_family_plan("cap-owner@test.com")
    client.post("/api/family/", headers=owner, json={"name": "Семья"})
    for i in range(2):
        r = client.post("/api/family/invite", headers=owner, json={"email": f"cap-member-{i}@test.com"})
        assert r.status_code == 201, r.text
    over_cap = client.post("/api/family/invite", headers=owner, json={"email": "cap-member-3@test.com"})
    assert over_cap.status_code == 400
    assert "максимум" in over_cap.json()["detail"]


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


def test_owner_can_remove_pending_invitation(client):
    owner = register_and_login(client, "owner-pending-remove@test.com")
    enable_family_plan("owner-pending-remove@test.com")
    client.post("/api/family/", headers=owner, json={"name": "Семья"})
    invited = client.post(
        "/api/family/invite",
        headers=owner,
        json={"email": "not-yet-registered@test.com"},
    )
    assert invited.status_code == 201, invited.text
    member_id = invited.json()["id"]

    removed = client.delete(f"/api/family/members/{member_id}", headers=owner)
    assert removed.status_code == 204, removed.text

    family = client.get("/api/family/", headers=owner).json()["family"]
    assert [m["email"] for m in family["members"]] == ["owner-pending-remove@test.com"]

    # Email свободен — можно пригласить снова
    reinvited = client.post(
        "/api/family/invite",
        headers=owner,
        json={"email": "not-yet-registered@test.com"},
    )
    assert reinvited.status_code == 201, reinvited.text


def test_owner_can_remove_active_member(client):
    owner = register_and_login(client, "owner-active-remove@test.com")
    member = register_and_login(client, "member-active-remove@test.com")
    enable_family_plan("owner-active-remove@test.com")
    enable_family_plan("member-active-remove@test.com")
    client.post("/api/family/", headers=owner, json={"name": "Семья"})
    invitation = client.post(
        "/api/family/invite", headers=owner, json={"email": "member-active-remove@test.com"}
    ).json()
    client.post(f"/api/family/invitations/{invitation['id']}/accept", headers=member)

    removed = client.delete(f"/api/family/members/{invitation['id']}", headers=owner)
    assert removed.status_code == 204, removed.text

    # Удалённый участник больше не видит семейное пространство
    after = client.get("/api/family/", headers=member).json()
    assert after["family"] is None


def test_member_can_leave_family_but_not_remove_others(client):
    owner = register_and_login(client, "owner-leave@test.com")
    member = register_and_login(client, "member-leave@test.com")
    enable_family_plan("owner-leave@test.com")
    enable_family_plan("member-leave@test.com")
    client.post("/api/family/", headers=owner, json={"name": "Семья"})
    invitation = client.post(
        "/api/family/invite", headers=owner, json={"email": "member-leave@test.com"}
    ).json()
    client.post(f"/api/family/invitations/{invitation['id']}/accept", headers=member)

    owner_member_id = next(
        m["id"] for m in client.get("/api/family/", headers=owner).json()["family"]["members"]
        if m["email"] == "owner-leave@test.com"
    )
    forbidden = client.delete(f"/api/family/members/{owner_member_id}", headers=member)
    assert forbidden.status_code == 403

    left = client.delete(f"/api/family/members/{invitation['id']}", headers=member)
    assert left.status_code == 204, left.text
    after = client.get("/api/family/", headers=member).json()
    assert after["family"] is None


def test_cannot_remove_owner(client):
    owner = register_and_login(client, "owner-protected@test.com")
    enable_family_plan("owner-protected@test.com")
    client.post("/api/family/", headers=owner, json={"name": "Семья"})
    owner_member_id = client.get("/api/family/", headers=owner).json()["family"]["members"][0]["id"]

    response = client.delete(f"/api/family/members/{owner_member_id}", headers=owner)
    assert response.status_code == 400


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


def test_family_analytics_includes_comparison_settlements_and_large_expenses(client):
    owner = register_and_login(client, "analytics-owner@test.com")
    member = register_and_login(client, "analytics-member@test.com")
    enable_family_plan("analytics-owner@test.com")
    enable_family_plan("analytics-member@test.com")
    client.post("/api/family/", headers=owner, json={"name": "Аналитика"})
    invitation = client.post(
        "/api/family/invite", headers=owner, json={"email": "analytics-member@test.com"}
    ).json()
    accepted = client.post(f"/api/family/invitations/{invitation['id']}/accept", headers=member).json()
    member_id = next(item["user_id"] for item in accepted["members"] if item["email"] == "analytics-member@test.com")
    account = make_account(client, member, balance=10000)
    categories = client.get("/api/categories/", headers=member).json()
    category_id = next(item["id"] for item in categories if item["name"] == "Продукты" and item["type"] == "expense")
    current = datetime(2026, 8, 15, tzinfo=timezone.utc)
    previous = datetime(2026, 7, 15, tzinfo=timezone.utc)
    for amount, tx_date, description in ((1200, current, "Большая покупка"), (500, previous, "Прошлый месяц")):
        response = client.post("/api/transactions/", headers=member, json={
            "amount": amount, "type": "expense", "currency": "RUB", "account_id": account["id"],
            "category_id": category_id, "date": tx_date.isoformat(), "description": description,
            "is_family_expense": True,
        })
        assert response.status_code == 201, response.text
    settlement = client.post("/api/family/settlements", headers=owner, json={
        "to_user_id": member_id, "amount": 300, "currency": "RUB", "date": current.isoformat(),
    })
    assert settlement.status_code == 201, settlement.text

    response = client.get("/api/family/analytics?year=2026&month=8", headers=owner)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["expense_total"] == 1200
    assert body["comparison"]["previous_expenses"] == 500
    assert body["comparison"]["expense_change"] == {"amount": 700, "percent": 140.0}
    assert next(item for item in body["members"] if item["user_id"] == member_id)["actual"] == 1200
    assert body["settlements_total"] == 300
    assert body["settlements"][0]["to_name"]
    assert body["notable_expenses"][0]["description"] == "Большая покупка"


def test_family_analytics_exposes_current_month_forecast(client):
    owner = register_and_login(client, "forecast-owner@test.com")
    enable_family_plan("forecast-owner@test.com")
    client.post("/api/family/", headers=owner, json={"name": "Прогноз"})
    account = make_account(client, owner, balance=10000)
    category_id = next(
        item["id"] for item in client.get("/api/categories/", headers=owner).json()
        if item["name"] == "Продукты" and item["type"] == "expense"
    )
    now = datetime.now(timezone.utc)
    actual = client.post("/api/transactions/", headers=owner, json={
        "amount": 1500, "type": "expense", "currency": "RUB", "account_id": account["id"],
        "category_id": category_id, "date": now.isoformat(), "is_family_expense": True,
    })
    assert actual.status_code == 201, actual.text
    planned = client.post("/api/transactions/", headers=owner, json={
        "amount": 900, "type": "expense", "currency": "RUB", "account_id": account["id"],
        "category_id": category_id, "date": now.replace(day=min(now.day + 1, 28)).isoformat(),
        "description": "Будущий общий платёж", "is_family_expense": True, "is_planned": True,
    })
    assert planned.status_code == 201, planned.text

    response = client.get(f"/api/family/analytics?year={now.year}&month={now.month}", headers=owner)
    assert response.status_code == 200, response.text
    forecast = response.json()["forecast"]
    assert forecast["is_current_period"] is True
    assert forecast["average_daily_expenses"] > 0
    assert forecast["predicted_expenses"] > 1500
    assert forecast["upcoming"][0]["description"] == "Будущий общий платёж"
    summary = response.json()["month_summary"]
    assert any(item["kind"] == "deficit" for item in summary)
    assert any(item["kind"] == "largest_category" and item["title"] == "Главная статья общих расходов: Продукты" for item in summary)


def test_family_recurring_suggestions_can_create_or_dismiss_shared_schedule(client):
    owner = register_and_login(client, "recurring-owner@test.com")
    enable_family_plan("recurring-owner@test.com")
    client.post("/api/family/", headers=owner, json={"name": "Регулярные"})
    account = make_account(client, owner, balance=10000)
    categories = client.get("/api/categories/", headers=owner).json()
    category_id = next(item["id"] for item in categories if item["name"] == "Коммунальные" and item["type"] == "expense")
    for transaction_date in ("2026-06-05T12:00:00Z", "2026-07-05T12:00:00Z", "2026-08-05T12:00:00Z"):
        response = client.post("/api/transactions/", headers=owner, json={
            "type": "expense",
            "amount": 1200,
            "currency": "RUB",
            "account_id": account["id"],
            "category_id": category_id,
            "description": "Интернет",
            "date": transaction_date,
            "is_family_expense": True,
        })
        assert response.status_code == 201, response.text

    suggestions = client.get("/api/family/recurring-suggestions", headers=owner)
    assert suggestions.status_code == 200, suggestions.text
    item = next(value for value in suggestions.json()["items"] if value["description"] == "Интернет")
    assert item["frequency"] == "monthly"
    assert item["can_create"] is True

    created = client.post(
        f"/api/family/recurring-suggestions/{item['fingerprint']}/create-recurring",
        headers=owner,
    )
    assert created.status_code == 201, created.text
    assert client.get("/api/family/recurring-suggestions", headers=owner).json()["items"] == []

    # When the schedule is due it creates a planned *shared* operation, so it
    # appears in the family plan and keeps the original privacy boundary.
    db = TestingSessionLocal()
    try:
        assert process_recurring_transactions(db, today=date(2026, 9, 5)) == 1
        generated = db.query(Transaction).filter(
            Transaction.description == "Интернет", Transaction.is_planned.is_(True),
        ).one()
        assert generated.is_family_expense is True
        assert generated.family_id is not None
    finally:
        db.close()

    # A similar pattern can be hidden permanently instead of becoming a plan.
    for transaction_date in ("2026-06-12T12:00:00Z", "2026-07-12T12:00:00Z", "2026-08-12T12:00:00Z"):
        response = client.post("/api/transactions/", headers=owner, json={
            "type": "expense", "amount": 500, "currency": "RUB", "account_id": account["id"],
            "category_id": category_id, "description": "Музыка", "date": transaction_date,
            "is_family_expense": True,
        })
        assert response.status_code == 201, response.text
    music = next(value for value in client.get("/api/family/recurring-suggestions", headers=owner).json()["items"] if value["description"] == "Музыка")
    dismissed = client.post(f"/api/family/recurring-suggestions/{music['fingerprint']}/dismiss", headers=owner)
    assert dismissed.status_code == 201, dismissed.text
    assert client.get("/api/family/recurring-suggestions", headers=owner).json()["items"] == []


def test_creating_family_recurring_suggestion_respects_notification_preference(client):
    owner = register_and_login(client, "recurring-notify@test.com")
    enable_family_plan("recurring-notify@test.com")
    client.post("/api/family/", headers=owner, json={"name": "Регулярные"})
    account = make_account(client, owner, balance=10000)
    categories = client.get("/api/categories/", headers=owner).json()
    category_id = next(item["id"] for item in categories if item["name"] == "Коммунальные" and item["type"] == "expense")
    for transaction_date in ("2026-06-05T12:00:00Z", "2026-07-05T12:00:00Z", "2026-08-05T12:00:00Z"):
        response = client.post("/api/transactions/", headers=owner, json={
            "type": "expense", "amount": 1200, "currency": "RUB", "account_id": account["id"],
            "category_id": category_id, "description": "Интернет", "date": transaction_date,
            "is_family_expense": True,
        })
        assert response.status_code == 201, response.text

    # Turn off in-app notifications for this event before the schedule is created.
    settings = client.put("/api/notifications/settings", headers=owner, json={
        "preferences": {"planned_operation": {"in_app": False, "email": False}},
    })
    assert settings.status_code == 200, settings.text

    item = next(
        value for value in client.get("/api/family/recurring-suggestions", headers=owner).json()["items"]
        if value["description"] == "Интернет"
    )
    created = client.post(
        f"/api/family/recurring-suggestions/{item['fingerprint']}/create-recurring",
        headers=owner,
    )
    assert created.status_code == 201, created.text

    unread = client.get("/api/notifications/", headers=owner).json()
    assert all("регулярный общий платёж" not in n["title"].lower() for n in unread["items"])


def test_me_update_sanitizes_notification_preferences(client):
    auth = register_and_login(client, "prefs-sanitize@test.com")
    response = client.put("/api/me/", headers=auth, json={
        "notification_preferences": {
            "planned_operation": {"in_app": False, "email": "yes"},
            "not_a_real_event": {"in_app": True, "email": True},
        },
    })
    assert response.status_code == 200, response.text
    saved = response.json()["notification_preferences"]
    assert "not_a_real_event" not in saved
    assert saved["planned_operation"] == {"in_app": False, "email": True}
    # Untouched events keep their documented defaults rather than being dropped.
    assert saved["credit_due"] == {"in_app": True, "email": True}
