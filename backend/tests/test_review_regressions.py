from datetime import date

from app.operations.budgets.common import _spent_for_category
from app.models.transaction import Transaction
from app.models.user import User
from app.services.auth import create_reset_token
from app.models.family import FamilyExpenseAccounting
from app.models.recurring_transaction import RecurringTransaction
from app.services.recurring_transactions import process_recurring_transactions
from tests.conftest import register_and_login, make_account, TestingSessionLocal


def family_purchase(client, amount=1200, when="2026-08-15T12:00:00Z"):
    owner = register_and_login(client, "review-owner@test.com")
    member = register_and_login(client, "review-member@test.com")
    client.post("/api/family/", headers=owner, json={"name": "Review"})
    invitation = client.post("/api/family/invite", headers=owner, json={"email": "review-member@test.com"}).json()
    client.post(f"/api/family/invitations/{invitation['id']}/accept", headers=member)
    oa = make_account(client, owner, balance=50000)
    ma = make_account(client, member, balance=50000)
    source = client.post("/api/transactions/", headers=member, json={
        "amount": amount, "type": "expense", "currency": "RUB", "account_id": ma["id"],
        "is_family_expense": True, "date": when,
    }).json()
    pending = client.get("/api/family/expense-accounting/pending", headers=owner).json()
    category = next(x["id"] for x in client.get("/api/categories/", headers=owner).json() if x["type"] == "expense")
    payload = {"items": [{"id": pending["items"][0]["id"], "owner_category_id": category, "owner_account_id": oa["id"]}]}
    return owner, member, source, payload


def test_family_pending_and_summary_share_period(client):
    owner, member, source, payload = family_purchase(client, 31260)
    response = client.post("/api/transactions/", headers=member, json={
        "amount": 330, "type": "expense", "currency": "RUB", "account_id": source["account_id"],
        "is_family_expense": True, "date": "2026-09-01T12:00:00Z",
    })
    assert response.status_code == 201
    params = {"year": 2026, "month": 8}
    pending = client.get("/api/family/expense-accounting/pending", headers=owner, params=params).json()
    assert sum(x["amount"] for x in pending["items"]) == 31260
    report = client.get("/api/family/report", headers=owner, params=params).json()
    assert report["totals"] == [{"currency": "RUB", "amount": 31260}]
    assert client.post("/api/family/expense-accounting/accept-batch", headers=owner, json=payload).status_code == 200
    assert client.get("/api/family/report", headers=owner, params=params).json()["totals"] == report["totals"]


def test_family_budget_uses_owner_category(client):
    owner, _, _, payload = family_purchase(client)
    accepted = client.post("/api/family/expense-accounting/accept-batch", headers=owner, json=payload)
    assert accepted.status_code == 200
    with TestingSessionLocal() as db:
        row = db.query(FamilyExpenseAccounting).filter(FamilyExpenseAccounting.owner_transaction_id.isnot(None)).one()
        assert _spent_for_category(db, row.owner_user_id, row.owner_category_id, "RUB", date(2026,8,1), date(2026,8,31), False, "family") == 1200


def test_recurring_backfills_each_missed_day(client):
    auth = register_and_login(client)
    account = make_account(client, auth)
    user_id = client.get("/api/me/", headers=auth).json()["id"]
    with TestingSessionLocal() as db:
        schedule = RecurringTransaction(user_id=user_id, account_id=account["id"], name="Daily", type="expense", amount=10,
            currency="RUB", frequency="daily", next_date=date(2026,9,1), execution_mode="manual")
        db.add(schedule); db.commit()
        assert process_recurring_transactions(db, today=date(2026,9,5)) == 5
        assert schedule.next_date == date(2026,9,6)
        assert process_recurring_transactions(db, today=date(2026,9,5)) == 0


def test_blocked_user_cannot_reuse_access_token(client):
    auth = register_and_login(client)
    uid = client.get("/api/me/", headers=auth).json()["id"]
    with TestingSessionLocal() as db:
        db.get(User, uid).is_active = False
        db.commit()
    for endpoint in ["/api/accounts/", "/api/transactions/", "/api/me/", "/api/family/"]:
        assert client.get(endpoint, headers=auth).status_code == 401


def test_reset_link_is_single_use_and_revokes_access(client):
    auth = register_and_login(client)
    uid = client.get("/api/me/", headers=auth).json()["id"]
    with TestingSessionLocal() as db:
        reset = create_reset_token(uid, db.get(User, uid).hashed_password)
    assert client.post("/api/auth/reset-password", json={"token": reset, "new_password": "new-password"}).status_code == 200
    assert client.post("/api/auth/reset-password", json={"token": reset, "new_password": "other-password"}).status_code == 400
    assert client.get("/api/accounts/", headers=auth).status_code == 401


def test_source_edit_updates_imported_copy_and_delete_undoes_it(client):
    owner, member, source, payload = family_purchase(client)
    accepted = client.post("/api/family/expense-accounting/accept-batch", headers=owner, json=payload).json()
    changed = client.patch(f"/api/transactions/{source['id']}", headers=member, json={"amount": 1800, "reimbursement_amount": 1800})
    assert changed.status_code == 200, changed.text
    with TestingSessionLocal() as db:
        assert db.get(Transaction, accepted["transaction_ids"][0]).amount == 1800
    assert client.delete(f"/api/transactions/{source['id']}", headers=member).status_code == 204
    with TestingSessionLocal() as db:
        assert db.get(Transaction, accepted["transaction_ids"][0]) is None


def test_credit_payment_cannot_be_deleted_as_plain_transaction(client):
    auth = register_and_login(client)
    account = make_account(client, auth, balance=50000)
    credit = client.post("/api/credits/", headers=auth, json={"name": "Loan", "kind": "mortgage", "currency": "RUB",
        "original_amount": 1000000, "current_balance": 900000, "monthly_payment": 11000,
        "annual_interest_rate": 12, "source_account_id": account["id"]}).json()
    payment = client.post(f"/api/credits/{credit['id']}/payments", headers=auth, json={"amount": 11000, "account_id": account["id"]}).json()
    assert client.delete(f"/api/transactions/{payment['transaction_id']}", headers=auth).status_code == 409
    assert client.patch(f"/api/transactions/{payment['transaction_id']}", headers=auth, json={"amount": 10}).status_code == 409


def test_import_confirmation_is_idempotent(client):
    auth = register_and_login(client)
    content = b"date;account;category;amount;currency;description;transfer\n01.08.2026;Cash;;-330;RUB;Review;\n"
    preview = client.post("/api/import/preview", headers=auth, files={"file": ("review.csv", content)}).json()
    first = client.post("/api/import/confirm", headers=auth, json={"import_token": preview["import_token"]})
    second = client.post("/api/import/confirm", headers=auth, json={"import_token": preview["import_token"]})
    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()
    assert len(client.get("/api/transactions/", headers=auth).json()["items"]) == 1


def test_missing_rate_preserves_account_and_does_not_report_zero(client, monkeypatch):
    from app.services.exchange import ExchangeError
    def unavailable(*args, **kwargs):
        raise ExchangeError("test provider unavailable")
    monkeypatch.setattr("app.services.exchange.convert_for_user", unavailable)
    auth = register_and_login(client)
    account = make_account(client, auth, balance=100, currency="USD")
    assert account["total_in_main"] is None
    assert account["balances"][0]["balance"] == 100
    assert account["balances"][0]["balance_in_main"] is None
    assert sum(row["id"] == account["id"] for row in client.get("/api/accounts/", headers=auth).json()) == 1
    assert client.get("/api/dashboard/", headers=auth).status_code == 503


def test_imported_category_change_updates_family_budget(client):
    owner, _, _, payload = family_purchase(client)
    accepted = client.post("/api/family/expense-accounting/accept-batch", headers=owner, json=payload).json()
    category = client.post("/api/categories/", headers=owner, json={"name": "Reassigned", "type": "expense"}).json()
    response = client.patch(f"/api/transactions/{accepted['transaction_ids'][0]}", headers=owner, json={"category_id": category["id"]})
    assert response.status_code == 200, response.text
    with TestingSessionLocal() as db:
        row = db.query(FamilyExpenseAccounting).filter(FamilyExpenseAccounting.owner_transaction_id.isnot(None)).one()
        assert row.owner_category_id == category["id"]
        assert _spent_for_category(db, row.owner_user_id, category["id"], "RUB", date(2026,8,1), date(2026,8,31), False, "family") == 1200


def test_concurrent_balance_writes_postgres(client):
    import pytest
    from concurrent.futures import ThreadPoolExecutor
    from tests.conftest import test_engine
    from app.services.accounts import get_or_create_balance
    if test_engine.dialect.name != "postgresql":
        pytest.skip("Real row locks require PostgreSQL")
    auth = register_and_login(client)
    account = make_account(client, auth, balance=1000)
    def debit(_):
        with TestingSessionLocal() as db:
            balance = get_or_create_balance(db, account["id"], "RUB")
            balance.balance -= 100
            db.commit()
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(debit, range(2)))
    with TestingSessionLocal() as db:
        assert get_or_create_balance(db, account["id"], "RUB").balance == 800
