from tests.conftest import register_and_login


def test_register_and_login(client):
    r = client.post("/api/auth/register", json={
        "email": "a@test.com", "username": "a", "password": "secret1",
    })
    assert r.status_code == 200, r.text
    r = client.post("/api/auth/login", json={"email": "a@test.com", "password": "secret1"})
    assert r.status_code == 200
    assert "access_token" in r.json()


def test_duplicate_email_rejected(client):
    client.post("/api/auth/register", json={"email": "b@test.com", "username": "b", "password": "secret1"})
    r = client.post("/api/auth/register", json={"email": "b@test.com", "username": "b2", "password": "secret1"})
    assert r.status_code == 400


def test_login_wrong_password(client):
    client.post("/api/auth/register", json={"email": "c@test.com", "username": "c", "password": "secret1"})
    r = client.post("/api/auth/login", json={"email": "c@test.com", "password": "wrong"})
    assert r.status_code == 401


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
