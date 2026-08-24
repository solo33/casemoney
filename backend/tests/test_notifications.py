from app.models.user import User
from tests.conftest import TestingSessionLocal, register_and_login


def _make_admin(email: str) -> None:
    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.email == email).one()
        user.is_admin = True
        db.commit()
    finally:
        db.close()


def test_admin_can_notify_everyone_and_user_can_read_notification(client):
    admin = register_and_login(client, "notify-admin@test.com")
    user = register_and_login(client, "notify-user@test.com")
    _make_admin("notify-admin@test.com")

    created = client.post(
        "/api/admin/notifications",
        headers=admin,
        json={
            "title": "Новая функция",
            "message": "Откройте семейные финансы",
            "link": "/settings/family",
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["recipients_count"] == 2

    page = client.get("/api/notifications/", headers=user)
    assert page.status_code == 200, page.text
    assert page.json()["unread_count"] == 1
    notification = page.json()["items"][0]
    assert notification["link"] == "/settings/family"

    marked = client.patch(
        f"/api/notifications/{notification['id']}/read",
        headers=user,
    )
    assert marked.status_code == 204
    assert client.get("/api/notifications/", headers=user).json()["unread_count"] == 0


def test_admin_can_notify_one_user_without_exposing_it_to_another(client):
    admin = register_and_login(client, "notify-one-admin@test.com")
    recipient = register_and_login(client, "notify-recipient@test.com")
    other = register_and_login(client, "notify-other@test.com")
    _make_admin("notify-one-admin@test.com")

    db = TestingSessionLocal()
    try:
        recipient_id = db.query(User).filter(User.email == "notify-recipient@test.com").one().id
    finally:
        db.close()

    created = client.post(
        "/api/admin/notifications",
        headers=admin,
        json={"title": "Личное", "message": "Только вам", "user_id": recipient_id},
    )
    assert created.status_code == 201, created.text
    assert created.json()["recipients_count"] == 1
    assert client.get("/api/notifications/", headers=recipient).json()["unread_count"] == 1
    assert client.get("/api/notifications/", headers=other).json()["unread_count"] == 0


def test_user_can_choose_notification_channels(client):
    auth = register_and_login(client, "notification-settings@test.com")
    initial = client.get("/api/notifications/settings", headers=auth)
    assert initial.status_code == 200, initial.text
    assert initial.json()["preferences"]["credit_due"] == {"in_app": True, "email": True, "push": True}

    preferences = initial.json()["preferences"]
    preferences["credit_due"] = {"in_app": False, "email": False, "push": False}
    saved = client.put("/api/notifications/settings", headers=auth, json={"preferences": preferences})
    assert saved.status_code == 200, saved.text
    assert saved.json()["preferences"]["credit_due"] == {"in_app": False, "email": False, "push": False}

    loaded = client.get("/api/notifications/settings", headers=auth)
    assert loaded.json()["preferences"]["credit_due"] == {"in_app": False, "email": False, "push": False}
