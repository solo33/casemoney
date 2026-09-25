from tests.conftest import register_and_login


def test_existing_list_can_be_shared_and_family_can_work_together(client, auth):
    member = register_and_login(client, 'shopping-member@example.com')
    outsider = register_and_login(client, 'shopping-outsider@example.com')
    assert client.post('/api/family/', headers=auth, json={'name': 'Family'}).status_code == 201
    invite = client.post('/api/family/invite', headers=auth, json={'email': 'shopping-member@example.com'}).json()
    assert client.post(f"/api/family/invitations/{invite['id']}/accept", headers=member).status_code == 200
    shopping = client.post('/api/shopping/lists', headers=auth, json={'name': 'Farm'}).json()
    list_url = f"/api/shopping/lists/{shopping['id']}"
    assert client.get(list_url + '/items', headers=member).status_code == 404
    category = client.get('/api/categories/', headers=auth).json()[0]
    item = client.post(list_url + '/items', headers=auth, json={'name': 'Milk', 'category_id': category['id']}).json()
    item_url = f"/api/shopping/items/{item['id']}"
    shared = client.patch(list_url, headers=auth, json={'is_shared': True})
    assert shared.status_code == 200, shared.text
    assert shared.json()['is_shared'] is True
    assert shopping['id'] in [entry['id'] for entry in client.get('/api/shopping/lists', headers=member).json()]
    assert client.get(list_url + '/items', headers=outsider).status_code == 404
    assert client.patch(item_url, headers=outsider, json={'status': 'bought'}).status_code == 404
    assert client.patch(list_url, headers=member, json={'is_shared': False}).status_code == 403
    assert client.delete(list_url, headers=member).status_code == 403
    bought = client.patch(item_url, headers=member, json={'status': 'bought'})
    assert bought.status_code == 200, bought.text
    assert bought.json()['actual_price'] is None
    assert bought.json()['transaction_id'] is None
    assert client.patch(item_url, headers=member, json={'status': 'planned'}).status_code == 200
    added = client.post(list_url + '/items', headers=member, json={'name': 'Bread'})
    assert added.status_code == 201, added.text
    assert client.delete(f"/api/shopping/items/{added.json()['id']}", headers=member).status_code == 204
    assert client.patch(list_url, headers=auth, json={'is_shared': False}).status_code == 200
    assert client.patch(item_url, headers=member, json={'status': 'bought'}).status_code == 404
    assert client.get(list_url + '/items', headers=auth).json()[0]['name'] == 'Milk'


def test_sharing_requires_family_and_does_not_change_private_list(client, auth):
    lists = client.get('/api/shopping/lists', headers=auth)
    assert lists.status_code == 200, lists.text
    list_id = lists.json()[0]['id']
    response = client.patch(f'/api/shopping/lists/{list_id}', headers=auth, json={'is_shared': True})
    assert response.status_code == 400
    assert client.get('/api/shopping/lists', headers=auth).json()[0]['is_shared'] is False
