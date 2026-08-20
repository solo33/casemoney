from datetime import date, timedelta

from app.models.user import User
from tests.conftest import TestingSessionLocal, account_balance, make_account, register_and_login


def enable_family(email: str) -> None:
    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.email == email).one()
        user.plan = "family"
        db.commit()
    finally:
        db.close()


def test_personal_plan_cannot_use_credits(client):
    auth = register_and_login(client, "credit-personal@test.com")
    response = client.get("/api/credits/", headers=auth)
    assert response.status_code == 403


def test_mortgage_payment_creates_expense_and_history(client):
    auth = register_and_login(client, "mortgage@test.com")
    enable_family("mortgage@test.com")
    account = make_account(client, auth, balance=50_000)
    created = client.post(
        "/api/credits/",
        headers=auth,
        json={
            "name": "Ипотека",
            "kind": "mortgage",
            "currency": "RUB",
            "original_amount": 1_000_000,
            "current_balance": 900_000,
            "monthly_payment": 11_000,
            "annual_interest_rate": 12,
            "due_day": 15,
            "source_account_id": account["id"],
        },
    )
    assert created.status_code == 201, created.text
    credit = created.json()
    paid = client.post(
        f"/api/credits/{credit['id']}/payments",
        headers=auth,
        json={"amount": 11_000, "account_id": account["id"]},
    )
    assert paid.status_code == 201, paid.text
    assert paid.json()["transaction_id"] is not None
    assert paid.json()["principal_amount"] == 2_000
    assert paid.json()["interest_amount"] == 9_000
    assert paid.json()["balance_after"] == 898_000
    assert account_balance(client, auth, account["id"]) == 39_000

    details = client.get("/api/credits/", headers=auth).json()[0]
    assert details["current_balance"] == 898_000
    assert len(details["payments"]) == 1
    assert details["payments"][0]["principal_amount"] == 2_000


def test_early_mortgage_payment_reduces_only_principal(client):
    auth = register_and_login(client, "mortgage-early@test.com")
    enable_family("mortgage-early@test.com")
    account = make_account(client, auth, balance=50_000)
    created = client.post(
        "/api/credits/",
        headers=auth,
        json={
            "name": "Ипотека с досрочным платежом",
            "kind": "mortgage",
            "currency": "RUB",
            "current_balance": 900_000,
            "annual_interest_rate": 12,
            "source_account_id": account["id"],
        },
    )
    assert created.status_code == 201, created.text

    paid = client.post(
        f"/api/credits/{created.json()['id']}/payments",
        headers=auth,
        json={"amount": 10_000, "account_id": account["id"], "is_early_payment": True},
    )
    assert paid.status_code == 201, paid.text
    assert paid.json()["is_early_payment"] is True
    assert paid.json()["principal_amount"] == 10_000
    assert paid.json()["interest_amount"] == 0
    assert paid.json()["balance_after"] == 890_000


def test_loan_disbursement_increases_account_without_becoming_income(client):
    auth = register_and_login(client, "loan-disbursement@test.com")
    enable_family("loan-disbursement@test.com")
    account = make_account(client, auth, balance=1_000)

    created = client.post(
        "/api/credits/",
        headers=auth,
        json={
            "name": "Кредит наличными",
            "kind": "loan",
            "currency": "RUB",
            "original_amount": 50_000,
            "current_balance": 50_000,
            "funds_received": True,
            "funds_account_id": account["id"],
        },
    )
    assert created.status_code == 201, created.text
    credit = created.json()
    assert credit["funds_received"] is True
    assert credit["funds_account_id"] == account["id"]
    assert credit["funding_transaction_id"] is not None
    assert account_balance(client, auth, account["id"]) == 51_000

    tx = client.get("/api/transactions/", headers=auth).json()["items"][0]
    assert tx["type"] == "income"
    assert tx["amount"] == 50_000

    summary = client.get("/api/reports/summary", headers=auth).json()
    assert summary["total_income"] == 0


def test_delete_credit_removes_linked_payments_and_restores_balances(client):
    auth = register_and_login(client, "credit-delete@test.com")
    enable_family("credit-delete@test.com")
    account = make_account(client, auth, balance=10_000)

    created = client.post(
        "/api/credits/",
        headers=auth,
        json={
            "name": "Удаляемый заём",
            "kind": "loan",
            "currency": "RUB",
            "original_amount": 50_000,
            "current_balance": 50_000,
            "funds_received": True,
            "funds_account_id": account["id"],
        },
    )
    assert created.status_code == 201, created.text
    credit = created.json()
    assert account_balance(client, auth, account["id"]) == 60_000

    paid = client.post(
        f"/api/credits/{credit['id']}/payments",
        headers=auth,
        json={"amount": 5_000, "account_id": account["id"]},
    )
    assert paid.status_code == 201, paid.text
    assert account_balance(client, auth, account["id"]) == 55_000

    deleted = client.delete(f"/api/credits/{credit['id']}", headers=auth)
    assert deleted.status_code == 204, deleted.text
    assert client.get("/api/credits/", headers=auth).json() == []
    assert client.get("/api/transactions/", headers=auth).json()["items"] == []
    assert account_balance(client, auth, account["id"]) == 10_000


def test_mortgage_without_disbursement_does_not_change_account(client):
    auth = register_and_login(client, "mortgage-no-cash@test.com")
    enable_family("mortgage-no-cash@test.com")
    account = make_account(client, auth, balance=1_000)
    created = client.post(
        "/api/credits/",
        headers=auth,
        json={
            "name": "Ипотека",
            "kind": "mortgage",
            "currency": "RUB",
            "original_amount": 5_000_000,
            "current_balance": 5_000_000,
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["funds_received"] is False
    assert account_balance(client, auth, account["id"]) == 1_000
    assert client.get("/api/transactions/", headers=auth).json()["items"] == []


def test_credit_card_payment_is_transfer_not_second_expense(client):
    auth = register_and_login(client, "credit-card@test.com")
    enable_family("credit-card@test.com")
    source = make_account(client, auth, name="Дебетовая", balance=1_000)
    card = make_account(client, auth, name="Кредитная", balance=-500)
    created = client.post(
        "/api/credits/",
        headers=auth,
        json={
            "name": "Кредитная карта",
            "kind": "credit_card",
            "currency": "RUB",
            "credit_limit": 100_000,
            "monthly_payment": 500,
            "next_payment_date": str(date.today() + timedelta(days=10)),
            "source_account_id": source["id"],
            "linked_account_id": card["id"],
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["current_balance"] == 500

    paid = client.post(
        f"/api/credits/{created.json()['id']}/payments",
        headers=auth,
        json={"amount": 200, "account_id": source["id"]},
    )
    assert paid.status_code == 201, paid.text
    assert account_balance(client, auth, source["id"]) == 800
    assert account_balance(client, auth, card["id"]) == -300

    tx = client.get("/api/transactions/", headers=auth).json()["items"][0]
    assert tx["type"] == "transfer"
    assert tx["to_account_id"] == card["id"]


def test_deposit_receipt_creates_income_and_keeps_principal(client):
    auth = register_and_login(client, "deposit@test.com")
    enable_family("deposit@test.com")
    account = make_account(client, auth, name="Карта для процентов", balance=100)
    created = client.post(
        "/api/credits/",
        headers=auth,
        json={
            "name": "Накопительный вклад",
            "kind": "deposit",
            "currency": "RUB",
            "original_amount": 100_000,
            "current_balance": 100_000,
            "monthly_payment": 750,
            "next_payment_date": str(date.today()),
            "due_day": date.today().day,
            "source_account_id": account["id"],
        },
    )
    assert created.status_code == 201, created.text
    deposit = created.json()
    assert deposit["direction"] == "receivable"

    received = client.post(
        f"/api/credits/{deposit['id']}/payments",
        headers=auth,
        json={"amount": 750, "account_id": account["id"]},
    )
    assert received.status_code == 201, received.text
    assert received.json()["balance_after"] == 100_000
    assert account_balance(client, auth, account["id"]) == 850

    details = client.get("/api/credits/", headers=auth).json()[0]
    assert details["kind"] == "deposit"
    assert details["current_balance"] == 100_000
    assert details["status"] == "active"
    assert details["next_payment_date"] > str(date.today())
    tx = client.get("/api/transactions/", headers=auth).json()["items"][0]
    assert tx["type"] == "income"
    assert tx["description"] == "Доход по депозиту: Накопительный вклад"


def test_deposit_interest_is_calculated_and_capitalized(client):
    auth = register_and_login(client, "deposit-interest@test.com")
    enable_family("deposit-interest@test.com")
    account = make_account(client, auth, balance=0)
    created = client.post("/api/credits/", headers=auth, json={
        "name": "Вклад 12%",
        "kind": "deposit",
        "currency": "RUB",
        "current_balance": 100_000,
        "annual_interest_rate": 12,
        "interest_payout_frequency": "monthly",
        "capitalization": True,
        "next_payment_date": str(date.today()),
        "source_account_id": account["id"],
    })
    assert created.status_code == 201, created.text
    deposit = created.json()
    assert deposit["monthly_payment"] == 1_000
    assert deposit["capitalization"] is True

    received = client.post(
        f"/api/credits/{deposit['id']}/payments",
        headers=auth,
        json={"amount": 1_000, "account_id": account["id"]},
    )
    assert received.status_code == 201, received.text
    assert received.json()["balance_after"] == 101_000
    assert account_balance(client, auth, account["id"]) == 1_000



def test_due_credit_creates_one_system_and_email_notification(client, monkeypatch):
    sent = []
    monkeypatch.setattr(
        "app.services.credit_reminders.send_credit_payment_reminder",
        lambda **kwargs: sent.append(kwargs) or True,
    )
    auth = register_and_login(client, "credit-reminder@test.com")
    enable_family("credit-reminder@test.com")
    account = make_account(client, auth, balance=1_000)
    created = client.post(
        "/api/credits/",
        headers=auth,
        json={
            "name": "Заём",
            "kind": "private_debt",
            "currency": "RUB",
            "current_balance": 1_000,
            "monthly_payment": 100,
            "next_payment_date": str(date.today() - timedelta(days=1)),
            "source_account_id": account["id"],
        },
    )
    assert created.status_code == 201
    assert client.get("/api/credits/summary", headers=auth).status_code == 200
    assert client.get("/api/credits/summary", headers=auth).status_code == 200
    notifications = client.get("/api/notifications/", headers=auth).json()
    assert notifications["unread_count"] == 1
    assert notifications["items"][0]["link"] == "/credits"
    assert len(sent) == 1
    assert sent[0]["to_email"] == "credit-reminder@test.com"
    assert sent[0]["credit_name"] == "Заём"


def test_failed_credit_email_is_retried_without_duplicate_system_notification(client, monkeypatch):
    attempts = []

    def send_reminder(**kwargs):
        attempts.append(kwargs)
        return len(attempts) > 1

    monkeypatch.setattr(
        "app.services.credit_reminders.send_credit_payment_reminder",
        send_reminder,
    )
    auth = register_and_login(client, "credit-email-retry@test.com")
    enable_family("credit-email-retry@test.com")
    account = make_account(client, auth, balance=1_000)
    created = client.post(
        "/api/credits/",
        headers=auth,
        json={
            "name": "Ипотека",
            "kind": "mortgage",
            "currency": "RUB",
            "current_balance": 100_000,
            "monthly_payment": 11_000,
            "next_payment_date": str(date.today()),
            "source_account_id": account["id"],
        },
    )
    assert created.status_code == 201
    assert client.get("/api/credits/summary", headers=auth).status_code == 200
    assert client.get("/api/credits/summary", headers=auth).status_code == 200

    notifications = client.get("/api/notifications/", headers=auth).json()
    assert notifications["unread_count"] == 1
    assert len(attempts) == 2


def test_due_deposit_creates_income_reminder(client, monkeypatch):
    sent = []
    monkeypatch.setattr(
        "app.services.credit_reminders.send_credit_payment_reminder",
        lambda **kwargs: sent.append(kwargs) or True,
    )
    auth = register_and_login(client, "deposit-reminder@test.com")
    enable_family("deposit-reminder@test.com")
    account = make_account(client, auth, balance=0)
    created = client.post(
        "/api/credits/",
        headers=auth,
        json={
            "name": "Вклад",
            "kind": "deposit",
            "currency": "RUB",
            "current_balance": 50_000,
            "monthly_payment": 500,
            "next_payment_date": str(date.today() - timedelta(days=1)),
            "source_account_id": account["id"],
        },
    )
    assert created.status_code == 201, created.text
    assert client.get("/api/credits/summary", headers=auth).status_code == 200

    notification = client.get("/api/notifications/", headers=auth).json()["items"][0]
    assert notification["title"] == "Не отмечено поступление: Вклад"
    assert "Поступление 500 RUB ожидалось" in notification["message"]
    assert len(sent) == 1
    assert sent[0]["is_income"] is True
