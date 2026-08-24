from app.models.user import User
from tests.conftest import TestingSessionLocal, enable_billing, register_and_login


def test_billing_overview_is_available_for_personal(client):
    auth = register_and_login(client, "billing-overview@test.com")
    response = client.get("/api/billing/overview", headers=auth)
    assert response.status_code == 200, response.text
    assert response.json()["plan"] == "personal"
    assert response.json()["family_price"] >= 0
    assert response.json()["family_upgrade_enabled"] is False


def test_test_family_checkout_is_disabled_during_free_launch(client):
    auth = register_and_login(client, "billing-locked@test.com")
    response = client.post("/api/billing/test-family", headers=auth, json={
        "period": "trial",
        "acknowledge_family_data_cleanup": True,
    })
    assert response.status_code == 409


def test_admin_can_enable_trial_and_user_activates_family(client):
    enable_billing()
    admin_auth = register_and_login(client, "billing-admin@test.com")
    user_auth = register_and_login(client, "billing-trial@test.com")
    db = TestingSessionLocal()
    try:
        admin = db.query(User).filter(User.email == "billing-admin@test.com").one()
        admin.is_admin = True
        user = db.query(User).filter(User.email == "billing-trial@test.com").one()
        user_id = user.id
        db.commit()
    finally:
        db.close()

    enabled = client.patch(
        f"/api/admin/users/{user_id}",
        headers=admin_auth,
        json={"family_upgrade_enabled": True},
    )
    assert enabled.status_code == 200, enabled.text
    assert enabled.json()["family_upgrade_enabled"] is True

    missing_warning = client.post("/api/billing/test-family", headers=user_auth, json={"period": "trial"})
    assert missing_warning.status_code == 400
    activated = client.post("/api/billing/test-family", headers=user_auth, json={
        "period": "trial",
        "acknowledge_family_data_cleanup": True,
    })
    assert activated.status_code == 200, activated.text
    overview = client.get("/api/billing/overview", headers=user_auth).json()
    assert overview["plan"] == "family"
    assert overview["subscription"]["provider"] == "test"
    assert overview["payments"][0]["kind"] == "trial"
    assert overview["payments"][0]["amount"] == 0


def test_test_month_payment_activates_family_without_card_data(client):
    enable_billing()
    auth = register_and_login(client, "billing-month@test.com")
    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.email == "billing-month@test.com").one()
        user.family_upgrade_enabled = True
        db.commit()
    finally:
        db.close()
    response = client.post("/api/billing/test-family", headers=auth, json={
        "period": "month",
        "accept_test_payment": True,
    })
    assert response.status_code == 200, response.text
    overview = client.get("/api/billing/overview", headers=auth).json()
    assert overview["plan"] == "family"
    assert overview["payments"][0]["kind"] == "test_month"
    assert overview["payments"][0]["amount"] == overview["test_month_price"]


def test_successful_checkout_activates_family(client, monkeypatch):
    enable_billing()
    auth = register_and_login(client, "billing-success@test.com")
    monkeypatch.setattr("app.services.yookassa.billing_configured", lambda: True)
    monkeypatch.setattr("app.services.yookassa.family_price", lambda: __import__("decimal").Decimal("299.00"))
    monkeypatch.setattr("app.services.yookassa.create_initial_payment", lambda **kwargs: {
        "id": "provider-payment-1",
        "status": "pending",
        "amount": {"value": f"{kwargs['amount']:.2f}", "currency": "RUB"},
        "confirmation": {"confirmation_url": "https://example.test/pay"},
    })
    checkout = client.post("/api/billing/checkout", headers=auth, json={"accept_recurring": True})
    assert checkout.status_code == 200, checkout.text
    assert checkout.json()["confirmation_url"] == "https://example.test/pay"

    monkeypatch.setattr("app.services.yookassa.get_payment", lambda payment_id: {
        "id": payment_id,
        "status": "succeeded",
        "amount": {"value": "299.00", "currency": "RUB"},
        "payment_method": {"id": "saved-method-1", "saved": True, "card": {"last4": "4242"}},
    })
    refreshed = client.post("/api/billing/refresh", headers=auth)
    assert refreshed.status_code == 200, refreshed.text
    assert refreshed.json()["status"] == "succeeded"

    overview = client.get("/api/billing/overview", headers=auth).json()
    assert overview["plan"] == "family"
    assert overview["plan_source"] == "billing"
    assert overview["subscription"]["payment_method_title"] == "Карта •••• 4242"
    assert overview["payments"][0]["status"] == "succeeded"

    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.email == "billing-success@test.com").one()
        assert user.plan_expires_at is not None
    finally:
        db.close()


def test_subscription_can_be_canceled_and_resumed(client, monkeypatch):
    enable_billing()
    auth = register_and_login(client, "billing-cancel@test.com")
    monkeypatch.setattr("app.services.yookassa.billing_configured", lambda: True)
    monkeypatch.setattr("app.services.yookassa.family_price", lambda: __import__("decimal").Decimal("299.00"))
    monkeypatch.setattr("app.services.yookassa.create_initial_payment", lambda **kwargs: {
        "id": "provider-payment-2", "status": "pending",
        "amount": {"value": f"{kwargs['amount']:.2f}", "currency": "RUB"},
        "confirmation": {"confirmation_url": "https://example.test/pay"},
    })
    client.post("/api/billing/checkout", headers=auth, json={"accept_recurring": True})
    assert client.post("/api/billing/cancel", headers=auth).status_code == 200
    assert client.post("/api/billing/resume", headers=auth).status_code == 400
