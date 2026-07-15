from tests.conftest import register_and_login, TestingSessionLocal


def test_register_reports_email_delivery_failure(client, monkeypatch):
    monkeypatch.setattr("app.api.auth.send_code_email", lambda *args, **kwargs: False)

    r = client.post("/api/auth/register", json={
        "email": "delivery-failure@test.com",
        "username": "delivery-failure",
        "password": "secret1",
    })

    assert r.status_code == 503
    assert "Не удалось отправить код" in r.json()["detail"]
    assert _get_code("delivery-failure@test.com") is None


def _get_code(email):
    from app.models.pending_registration import PendingRegistration
    db = TestingSessionLocal()
    try:
        p = db.query(PendingRegistration).filter(PendingRegistration.email == email).first()
        return p.code if p else None
    finally:
        db.close()


def test_register_requires_code_then_creates_user(client):
    r = client.post("/api/auth/register", json={
        "email": "a@test.com", "username": "a", "password": "secret1",
    })
    assert r.status_code == 200, r.text
    assert r.json()["requires_code"] is True

    # пользователь ещё не создан — логин невозможен
    r = client.post("/api/auth/login", json={"email": "a@test.com", "password": "secret1"})
    assert r.status_code == 401

    # подтверждаем кодом → автологин
    code = _get_code("a@test.com")
    r = client.post("/api/auth/verify-code", json={"email": "a@test.com", "code": code})
    assert r.status_code == 200
    assert "access_token" in r.json()

    # теперь логин работает
    r = client.post("/api/auth/login", json={"email": "a@test.com", "password": "secret1"})
    assert r.status_code == 200


def test_wrong_code_rejected(client):
    client.post("/api/auth/register", json={"email": "b@test.com", "username": "b", "password": "secret1"})
    r = client.post("/api/auth/verify-code", json={"email": "b@test.com", "code": "000000"})
    assert r.status_code == 400


def test_duplicate_email_rejected(client):
    register_and_login(client, email="c@test.com")  # полноценно создаёт юзера
    r = client.post("/api/auth/register", json={"email": "c@test.com", "username": "c2", "password": "secret1"})
    assert r.status_code == 400


def test_login_wrong_password(client):
    register_and_login(client, email="d@test.com", password="rightpass")
    r = client.post("/api/auth/login", json={"email": "d@test.com", "password": "wrong"})
    assert r.status_code == 401


def test_resend_cooldown(client):
    client.post("/api/auth/register", json={"email": "e@test.com", "username": "e", "password": "secret1"})
    # повторный запрос сразу → кулдаун 429
    r = client.post("/api/auth/register", json={"email": "e@test.com", "username": "e", "password": "secret1"})
    assert r.status_code == 429


def test_protected_requires_token(client):
    r = client.get("/api/accounts/")
    assert r.status_code in (401, 403)


def test_forgot_password_always_ok(client):
    r = client.post("/api/auth/forgot-password", json={"email": "nobody@test.com"})
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_public_config_has_registration_flag(client):
    r = client.get("/api/auth/config")
    assert r.status_code == 200
    assert r.json()["registration_enabled"] is True


def test_health(client):
    assert client.get("/health").json()["status"] == "ok"
