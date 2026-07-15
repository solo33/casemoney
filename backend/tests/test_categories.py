def _tree(client, auth, category_type="expense"):
    response = client.get("/api/categories/tree", headers=auth)
    assert response.status_code == 200, response.text
    return [item for item in response.json() if item["type"] == category_type]


def test_reorder_root_categories(client, auth):
    roots = _tree(client, auth)
    assert len(roots) >= 2
    expected_ids = [category["id"] for category in reversed(roots)]

    response = client.post(
        "/api/categories/reorder",
        headers=auth,
        json={"category_ids": expected_ids, "parent_id": None},
    )
    assert response.status_code == 204, response.text
    assert [category["id"] for category in _tree(client, auth)] == expected_ids


def test_reorder_subcategories(client, auth):
    parent = client.post(
        "/api/categories/",
        headers=auth,
        json={"name": "Порядок", "type": "expense"},
    ).json()
    children = []
    for name in ("Альфа", "Бета", "Гамма"):
        response = client.post(
            "/api/categories/",
            headers=auth,
            json={"name": name, "type": "expense", "parent_id": parent["id"]},
        )
        assert response.status_code == 201, response.text
        children.append(response.json())

    expected_ids = [category["id"] for category in reversed(children)]
    response = client.post(
        "/api/categories/reorder",
        headers=auth,
        json={"category_ids": expected_ids, "parent_id": parent["id"]},
    )
    assert response.status_code == 204, response.text

    root = next(category for category in _tree(client, auth) if category["id"] == parent["id"])
    assert [category["id"] for category in root["children"]] == expected_ids


def test_reorder_rejects_categories_from_different_levels(client, auth):
    parent_response = client.post(
        "/api/categories/",
        headers=auth,
        json={"name": "Родитель", "type": "expense"},
    )
    parent = parent_response.json()
    child_response = client.post(
        "/api/categories/",
        headers=auth,
        json={"name": "Ребёнок", "type": "expense", "parent_id": parent["id"]},
    )
    child = child_response.json()
    response = client.post(
        "/api/categories/reorder",
        headers=auth,
        json={
            "category_ids": [parent["id"], child["id"]],
            "parent_id": None,
        },
    )
    assert response.status_code == 400
