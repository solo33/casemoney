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
