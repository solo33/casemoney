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


def test_ai_reserves_quota_before_provider_and_applies_cooldown(client, monkeypatch):
    from app.models.ai_usage import AiUsage
    from tests.conftest import TestingSessionLocal
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-provider-key")
    auth = register_and_login(client, "quota@test.com")
    _enable_family("quota@test.com")
    class Response:
        def raise_for_status(self):
            pass
        def json(self):
            return {"choices": [{"message": {"content": '{"recommendations": ["Test recommendation"]}'}}]}
    class Provider:
        def __init__(self, **kwargs):
            pass
        async def __aenter__(self):
            return self
        async def __aexit__(self, *args):
            pass
        async def post(self, *args, **kwargs):
            with TestingSessionLocal() as db:
                assert db.query(AiUsage).one().request_count == 1
            return Response()
    monkeypatch.setattr("app.operations.finance_ai.commands.httpx.AsyncClient", Provider)
    payload = {"scenario": "monthly_overview", "period_days": 30}
    assert client.post("/api/finance-ai/insight", headers=auth, json=payload).status_code == 200
    assert client.post("/api/finance-ai/insight", headers=auth, json=payload).status_code == 429


def test_ai_provider_failure_refunds_reserved_quota(client, monkeypatch):
    from app.models.ai_usage import AiUsage
    from tests.conftest import TestingSessionLocal
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-provider-key")
    auth = register_and_login(client, "failed-quota@test.com")
    _enable_family("failed-quota@test.com")
    class Provider:
        def __init__(self, **kwargs):
            pass
        async def __aenter__(self):
            raise RuntimeError("mock provider unavailable")
        async def __aexit__(self, *args):
            pass
    monkeypatch.setattr("app.operations.finance_ai.commands.httpx.AsyncClient", Provider)
    response = client.post("/api/finance-ai/insight", headers=auth, json={"scenario": "monthly_overview", "period_days": 30})
    assert response.status_code == 502
    with TestingSessionLocal() as db:
        assert db.query(AiUsage).one().request_count == 0
