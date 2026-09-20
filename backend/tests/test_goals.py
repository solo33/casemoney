def create_goal(client, auth):
    response = client.post("/api/goals/", headers=auth, json={
        "name": "Резервный фонд",
        "target_amount": 100_000,
        "currency": "RUB",
    })
    assert response.status_code == 201, response.text
    return response.json()


def test_goal_can_be_archived_and_restored_without_deleting_it(client, auth):
    goal = create_goal(client, auth)

    archive = client.post(f"/api/goals/{goal['id']}/archive", headers=auth)
    assert archive.status_code == 200, archive.text
    assert archive.json()["is_archived"] is True
    assert archive.json()["archived_at"] is not None

    active_list = client.get("/api/goals/", headers=auth)
    assert active_list.status_code == 200
    assert active_list.json() == []

    all_goals = client.get("/api/goals/?include_archived=true", headers=auth)
    assert all_goals.status_code == 200
    assert [item["id"] for item in all_goals.json()] == [goal["id"]]

    restore = client.post(f"/api/goals/{goal['id']}/restore", headers=auth)
    assert restore.status_code == 200, restore.text
    assert restore.json()["is_archived"] is False
    assert restore.json()["archived_at"] is None


def test_goals_allocate_available_balance_in_priority_order(client, auth):
    from tests.conftest import make_account

    make_account(client, auth, name="Резерв", balance=150, currency="RUB")
    first = client.post("/api/goals/", headers=auth, json={
        "name": "Первая", "target_amount": 100, "currency": "RUB", "sort_order": 1,
    })
    second = client.post("/api/goals/", headers=auth, json={
        "name": "Вторая", "target_amount": 100, "currency": "RUB", "sort_order": 2,
    })
    assert first.status_code == 201, first.text
    assert second.status_code == 201, second.text

    response = client.get("/api/goals/", headers=auth)
    assert response.status_code == 200, response.text
    goals = response.json()
    assert [goal["name"] for goal in goals] == ["Первая", "Вторая"]
    assert goals[0]["priority_allocation_amount"] == 100
    assert goals[0]["priority_shortfall_amount"] == 0
    assert goals[1]["priority_allocation_amount"] == 50
    assert goals[1]["priority_shortfall_amount"] == 50


def test_goal_combines_accounts_deduplicates_and_can_return_to_manual(client, auth):
    from tests.conftest import make_account
    rub = make_account(client, auth, name="RUB", balance=1000, currency="RUB")
    usd = make_account(client, auth, name="USD", balance=10, currency="USD")
    response = client.post("/api/goals/", headers=auth, json={
        "name": "Reserve", "target_amount": 5000, "currency": "RUB",
        "account_ids": [rub["id"], usd["id"], rub["id"]],
    })
    assert response.status_code == 201, response.text
    goal = response.json()
    assert goal["account_ids"] == [rub["id"], usd["id"]]
    assert goal["current_amount"] == 1900
    assert goal["progress_percent"] == 38
    url = f"/api/goals/{goal['id']}"
    renamed = client.patch(url, headers=auth, json={"name": "Changed"})
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["account_ids"] == goal["account_ids"]
    removed = client.patch(url, headers=auth, json={"account_ids": [usd["id"]]})
    assert removed.json()["current_amount"] == 900
    manual = client.patch(url, headers=auth, json={"account_ids": [], "current_amount": 125})
    assert manual.json()["current_amount"] == 125
    assert manual.json()["account_id"] is None
    assert manual.json()["accounts"] == []


def test_goal_legacy_link_and_invalid_update_remain_atomic(client, auth):
    from tests.conftest import make_account, register_and_login
    account = make_account(client, auth, balance=250)
    other = register_and_login(client, email="other-goal@example.com")
    foreign = make_account(client, other, balance=999)
    response = client.post("/api/goals/", headers=auth, json={
        "name": "Legacy", "target_amount": 1000, "account_id": account["id"],
    })
    assert response.status_code == 201, response.text
    goal = response.json()
    assert goal["account_ids"] == [account["id"]]
    rejected = client.patch(f"/api/goals/{goal['id']}", headers=auth, json={
        "name": "Must not change", "account_ids": [account["id"], foreign["id"]],
    })
    assert rejected.status_code == 400
    saved = client.get("/api/goals/", headers=auth).json()[0]
    assert saved["name"] == "Legacy"
    assert saved["current_amount"] == 250


def test_goal_account_migration_preserves_old_links():
    import importlib.util
    from pathlib import Path
    from sqlalchemy import create_engine, text
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    path = Path(__file__).parents[1] / "alembic/versions/a0198a000001_goal_accounts.py"
    spec = importlib.util.spec_from_file_location("goal_accounts_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("PRAGMA foreign_keys=ON"))
        connection.execute(text("CREATE TABLE accounts (id INTEGER PRIMARY KEY)"))
        connection.execute(text("CREATE TABLE goals (id INTEGER PRIMARY KEY, account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL)"))
        connection.execute(text("INSERT INTO accounts VALUES (1), (2)"))
        connection.execute(text("INSERT INTO goals VALUES (1, 1), (2, NULL)"))
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
            assert connection.execute(text("SELECT * FROM goal_accounts")).all() == [(1, 1)]
            connection.execute(text("INSERT INTO goal_accounts VALUES (1, 2)"))
            connection.execute(text("DELETE FROM accounts WHERE id=1"))
            assert connection.execute(text("SELECT * FROM goal_accounts")).all() == [(1, 2)]
            migration.downgrade()
            assert connection.execute(text("SELECT account_id FROM goals WHERE id=1")).scalar() == 2
    engine.dispose()


def test_shared_goal_multi_account_total_is_same_for_member_and_family_report(client, auth):
    from datetime import date
    from tests.conftest import make_account, register_and_login
    member = register_and_login(client, "shared-goal-member@example.com")
    family = client.post("/api/family/", headers=auth, json={"name": "Family"})
    assert family.status_code == 201, family.text
    invite = client.post("/api/family/invite", headers=auth, json={"email": "shared-goal-member@example.com"}).json()
    accepted = client.post(f"/api/family/invitations/{invite['id']}/accept", headers=member)
    assert accepted.status_code == 200, accepted.text
    first = make_account(client, auth, name="One", balance=1000)
    second = make_account(client, auth, name="Two", balance=2000)
    response = client.post("/api/goals/", headers=auth, json={
        "name": "Shared", "target_amount": 10000, "currency": "RUB", "is_shared": True,
        "account_ids": [first["id"], second["id"]],
    })
    assert response.status_code == 201, response.text
    goal_id = response.json()["id"]
    contributed = client.post(f"/api/goals/{goal_id}/contributions", headers=member, json={"amount": 100})
    assert contributed.status_code in (200, 201), contributed.text
    for headers in (auth, member):
        goal = client.get("/api/goals/", headers=headers).json()[0]
        assert goal["current_amount"] == 3100
    today = date.today()
    report = client.get(f"/api/family/analytics?year={today.year}&month={today.month}", headers=member)
    assert report.status_code == 200, report.text
    assert report.json()["goals"][0]["current_amount"] == 3100
