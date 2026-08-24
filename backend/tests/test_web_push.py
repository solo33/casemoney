from app.models.push_subscription import PushSubscription
from app.models.user import User
from app.services.notifications import notify_user


PUSH_PAYLOAD = {
    "endpoint": "https://push.example.test/subscription/abc123",
    "p256dh": "a" * 40,
    "auth": "b" * 20,
    "user_agent": "CaseMoney test browser",
}


def test_push_subscription_is_saved_and_can_be_removed(client, monkeypatch):
    monkeypatch.setenv("VAPID_PUBLIC_KEY", "public-key-for-test")
    monkeypatch.setenv("VAPID_PRIVATE_KEY", "private-key-for-test")
    auth = __import__("tests.conftest", fromlist=["register_and_login"]).register_and_login(client, "push-user@test.com")

    config = client.get("/api/notifications/push/config", headers=auth)
    assert config.status_code == 200
    assert config.json() == {"enabled": True, "public_key": "public-key-for-test"}

    created = client.post("/api/notifications/push/subscribe", headers=auth, json=PUSH_PAYLOAD)
    assert created.status_code == 201
    # Same browser endpoint must be updated, not duplicated.
    updated = client.post("/api/notifications/push/subscribe", headers=auth, json={**PUSH_PAYLOAD, "user_agent": "Updated"})
    assert updated.status_code == 201

    from tests.conftest import TestingSessionLocal
    db = TestingSessionLocal()
    try:
        subscriptions = db.query(PushSubscription).all()
        assert len(subscriptions) == 1
        assert subscriptions[0].user_agent == "Updated"
    finally:
        db.close()

    removed = client.request("DELETE", "/api/notifications/push/subscribe", headers=auth, json={"endpoint": PUSH_PAYLOAD["endpoint"]})
    assert removed.status_code == 204


def test_notify_user_sends_push_when_enabled(monkeypatch):
    from tests.conftest import TestingSessionLocal

    calls = []
    monkeypatch.setattr("app.services.notifications.send_web_pushes", lambda db, user, **kwargs: calls.append((user.id, kwargs)) or 1)
    db = TestingSessionLocal()
    try:
        user = User(email="push-notify@test.com", username="push-notify", hashed_password="hash")
        db.add(user)
        db.commit()
        notify_user(db, user, event="budget_limit", title="Бюджет", message="Проверьте лимит", link="/budget")
        assert calls == [(user.id, {"title": "Бюджет", "link": "/budget"})]
    finally:
        db.close()
