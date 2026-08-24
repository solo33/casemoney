import io

from tests.conftest import make_account, register_and_login


def _expense(client, auth, account_id):
    response = client.post(
        "/api/transactions/",
        headers=auth,
        json={
            "type": "expense",
            "amount": 250.0,
            "currency": "RUB",
            "account_id": account_id,
            "description": "Продукты",
            "date": "2026-08-24T12:00:00",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_receipt_upload_items_and_private_file_access(client, auth, monkeypatch, tmp_path):
    monkeypatch.setenv("RECEIPT_UPLOAD_DIR", str(tmp_path / "receipts"))
    account = make_account(client, auth)
    expense = _expense(client, auth, account["id"])

    response = client.post(
        "/api/receipts/upload",
        headers=auth,
        data={
            "merchant": "Магазин у дома",
            "receipt_date": "2026-08-24",
            "total_amount": "250",
            "currency": "rub",
            "transaction_id": str(expense["id"]),
        },
        files={"file": ("receipt.jpg", io.BytesIO(b"jpeg bytes"), "image/jpeg")},
    )
    assert response.status_code == 201, response.text
    receipt = response.json()
    assert receipt["merchant"] == "Магазин у дома"
    assert receipt["currency"] == "RUB"
    assert receipt["transaction_id"] == expense["id"]

    response = client.post(
        f"/api/receipts/{receipt['id']}/items",
        headers=auth,
        json={"name": "Молоко", "quantity": 2, "unit_price": 90, "total_amount": 180},
    )
    assert response.status_code == 201, response.text
    assert response.json()["name"] == "Молоко"

    response = client.get(f"/api/receipts/{receipt['id']}/file", headers=auth)
    assert response.status_code == 200
    assert response.content == b"jpeg bytes"

    other_auth = register_and_login(client)
    response = client.get(f"/api/receipts/{receipt['id']}/file", headers=other_auth)
    assert response.status_code == 404

    response = client.delete(f"/api/receipts/{receipt['id']}", headers=auth)
    assert response.status_code == 204
    assert list((tmp_path / "receipts").glob("*")) == []


def test_receipt_rejects_non_expense_transaction_and_invalid_format(client, auth, monkeypatch, tmp_path):
    monkeypatch.setenv("RECEIPT_UPLOAD_DIR", str(tmp_path / "receipts"))
    account = make_account(client, auth)
    transfer = client.post(
        "/api/transactions/",
        headers=auth,
        json={
            "type": "income", "amount": 100, "currency": "RUB", "account_id": account["id"],
            "date": "2026-08-24T12:00:00",
        },
    ).json()

    response = client.post(
        "/api/receipts/upload",
        headers=auth,
        data={"transaction_id": str(transfer["id"])},
        files={"file": ("receipt.txt", io.BytesIO(b"not an image"), "text/plain")},
    )
    assert response.status_code == 400

    response = client.post(
        "/api/receipts/upload",
        headers=auth,
        data={"transaction_id": str(transfer["id"])},
        files={"file": ("receipt.jpg", io.BytesIO(b"jpeg bytes"), "image/jpeg")},
    )
    assert response.status_code == 400
    assert "расходу" in response.json()["detail"]
