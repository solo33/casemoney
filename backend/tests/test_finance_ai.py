from tests.conftest import register_and_login


def _enable_family(email: str):
    from app.models.user import User
    from tests.conftest import TestingSessionLocal

    db = TestingSessionLocal()
    try:
        db.query(User).filter(User.email == email).update({"plan": "family"})
        db.commit()
    finally:
        db.close()


def test_finance_ai_rejects_missing_server_key(client, monkeypatch):
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    auth = register_and_login(client, "finance-ai@test.com")
    _enable_family("finance-ai@test.com")
    response = client.post(
        "/api/finance-ai/insight",
        headers=auth,
        json={"scenario": "monthly_overview", "period_days": 30},
    )
    assert response.status_code == 503
    assert "временно не настроен" in response.json()["detail"]
