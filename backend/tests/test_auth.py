from datetime import datetime, timedelta, timezone

from tests.conftest import register_and_login, TestingSessionLocal

from app.models.user import User
from app.services.auth import create_activation_token


def _get_user(email: str) -> User | None:
    db = TestingSessionLocal()
    try:
        return db.query(User).filter(User.email == email).first()
    finally:
        db.close()


def test_registration_succeeds_when_email_delivery_fails(client, monkeypatch):
    monkeypatch.setattr("app.api.auth.send_activation_email", lambda *args: False)

    response = client.post("/api/auth/register", json={
        "email": "delivery-failure@test.com",
        "username": "delivery-failure",
        "password": "secret1",
    })

    assert response.status_code == 200
    assert response.json()["access_token"]
    assert response.json()["email_sent"] is False
    assert _get_user("delivery-failure@test.com").email_verified is False


def test_registration_creates_unverified_user_with_seven_day_access(client):
    response = client.post("/api/auth/register", json={
        "email": "grace@test.com",
        "username": "grace",
        "password": "secret1",
    })

    assert response.status_code == 200
    assert response.json()["requires_code"] is False
    assert response.json()["verification_grace_days"] == 7
    assert response.json()["access_token"]

    login = client.post("/api/auth/login", json={
        "email": "grace@test.com",
        "password": "secret1",
    })
    assert login.status_code == 200


def test_registration_notifies_owner_in_background(client, monkeypatch):
    notifications = []
    monkeypatch.setattr(
        "app.api.auth.send_registration_notification",
        lambda *args: notifications.append(args) or True,
    )

    response = client.post("/api/auth/register", json={
        "email": "owner-notification@test.com",
        "username": "owner-notification",
        "password": "secret1",
    })

    assert response.status_code == 200
    assert len(notifications) == 1
    assert notifications[0][0] == "owner-notification@test.com"
    assert notifications[0][1] == "owner-notification"
    assert notifications[0][2]


def test_unverified_login_is_blocked_after_seven_days(client):
    client.post("/api/auth/register", json={
        "email": "expired@test.com",
        "username": "expired",
        "password": "secret1",
    })
    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.email == "expired@test.com").one()
        user.created_at = datetime.now(timezone.utc) - timedelta(days=8)
        db.commit()
    finally:
        db.close()

    response = client.post("/api/auth/login", json={
        "email": "expired@test.com",
        "password": "secret1",
    })
    assert response.status_code == 403


def test_activation_link_verifies_account(client):
    client.post("/api/auth/register", json={
        "email": "activate@test.com",
        "username": "activate",
        "password": "secret1",
    })
    user = _get_user("activate@test.com")
    response = client.get(
        "/api/auth/activate",
        params={"token": create_activation_token(user.id)},
    )
    assert response.status_code == 200
    assert _get_user("activate@test.com").email_verified is True


def test_resend_has_persistent_cooldown_and_attempt_cap(client):
    client.post("/api/auth/register", json={
        "email": "resend@test.com",
        "username": "resend",
        "password": "secret1",
    })

    # Immediate resend is silently skipped to avoid account enumeration.
    response = client.post(
        "/api/auth/resend-activation", json={"email": "resend@test.com"}
    )
    assert response.status_code == 200
    assert _get_user("resend@test.com").verification_email_attempts == 1

    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.email == "resend@test.com").one()
        user.verification_email_sent_at = datetime.now(timezone.utc) - timedelta(minutes=16)
        db.commit()
    finally:
        db.close()

    client.post("/api/auth/resend-activation", json={"email": "resend@test.com"})
    assert _get_user("resend@test.com").verification_email_attempts == 2

    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.email == "resend@test.com").one()
        user.verification_email_attempts = 5
        user.verification_email_sent_at = datetime.now(timezone.utc) - timedelta(days=1)
        db.commit()
    finally:
        db.close()

    client.post("/api/auth/resend-activation", json={"email": "resend@test.com"})
    assert _get_user("resend@test.com").verification_email_attempts == 5


def test_duplicate_email_rejected(client):
    register_and_login(client, email="duplicate@test.com")
    response = client.post("/api/auth/register", json={
        "email": "duplicate@test.com",
        "username": "duplicate2",
        "password": "secret1",
    })
    assert response.status_code == 400


def test_duplicate_email_is_case_insensitive(client):
    register_and_login(client, email="duplicate-case@test.com")
    response = client.post("/api/auth/register", json={
        "email": "DUPLICATE-CASE@test.com",
        "username": "duplicate-case-2",
        "password": "secret1",
    })
    assert response.status_code == 400
    assert response.json()["detail"] == "Email уже зарегистрирован"


def test_email_is_normalized_and_login_is_case_insensitive(client):
    response = client.post("/api/auth/register", json={
        "email": "Normalized-Email@test.com",
        "username": "normalized-email",
        "password": "secret1",
    })
    assert response.status_code == 200
    assert _get_user("normalized-email@test.com") is not None

    login_response = client.post("/api/auth/login", json={
        "email": "NORMALIZED-EMAIL@test.com",
        "password": "secret1",
    })
    assert login_response.status_code == 200


def test_duplicate_username_is_allowed(client):
    first = client.post("/api/auth/register", json={
        "email": "same-name-one@test.com",
        "username": "Алексей",
        "password": "secret1",
    })
    second = client.post("/api/auth/register", json={
        "email": "same-name-two@test.com",
        "username": "Алексей",
        "password": "secret1",
    })

    assert first.status_code == 200
    assert second.status_code == 200
    assert _get_user("same-name-one@test.com").username == "Алексей"
    assert _get_user("same-name-two@test.com").username == "Алексей"


def test_login_wrong_password(client):
    register_and_login(client, email="wrong-password@test.com", password="rightpass")
    response = client.post("/api/auth/login", json={
        "email": "wrong-password@test.com",
        "password": "wrong",
    })
    assert response.status_code == 401


def test_protected_requires_token(client):
    response = client.get("/api/accounts/")
    assert response.status_code in (401, 403)


def test_forgot_password_always_ok(client):
    response = client.post(
        "/api/auth/forgot-password", json={"email": "nobody@test.com"}
    )
    assert response.status_code == 200
    assert response.json()["ok"] is True


def test_public_config_has_registration_flag(client):
    response = client.get("/api/auth/config")
    assert response.status_code == 200
    assert response.json()["registration_enabled"] is True


def test_health(client):
    assert client.get("/health").json()["status"] == "ok"
