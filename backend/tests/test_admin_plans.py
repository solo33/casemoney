from app.models.user import User
from tests.conftest import TestingSessionLocal, register_and_login


def test_new_user_has_personal_plan_and_admin_can_change_it(client):
    admin_headers = register_and_login(client, "plans-admin@test.com")
    register_and_login(client, "plans-user@test.com")

    db = TestingSessionLocal()
    try:
        admin = db.query(User).filter(User.email == "plans-admin@test.com").one()
        admin.is_admin = True
        target = db.query(User).filter(User.email == "plans-user@test.com").one()
        target_id = target.id
        assert target.plan == "personal"
        db.commit()
    finally:
        db.close()

    response = client.patch(
        f"/api/admin/users/{target_id}",
        headers=admin_headers,
        json={"plan": "family"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["plan"] == "family"
    user_headers = register_and_login(client, "plans-notification-user@test.com")

    db = TestingSessionLocal()
    try:
        notification_target = db.query(User).filter(User.email == "plans-notification-user@test.com").one()
        notification_target_id = notification_target.id
    finally:
        db.close()
    activated = client.patch(
        f"/api/admin/users/{notification_target_id}",
        headers=admin_headers,
        json={"plan": "family"},
    )
    assert activated.status_code == 200, activated.text
    notifications = client.get("/api/notifications/", headers=user_headers).json()
    assert notifications["unread_count"] == 1
    assert notifications["items"][0]["title"] == "Тариф Family активирован"
    assert notifications["items"][0]["link"] == "/billing"

    invalid = client.patch(
        f"/api/admin/users/{target_id}",
        headers=admin_headers,
        json={"plan": "business"},
    )
    assert invalid.status_code == 422
