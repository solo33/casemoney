import io

from tests.conftest import account_balance


def _preview(client, auth, content: bytes, filename: str):
    return client.post(
        "/api/import/preview",
        headers=auth,
        files={"file": (filename, content, "application/octet-stream")},
    )


def test_csv_import_scans_and_imports_transfer(client, auth):
    content = (
        "date;account;category;amount;currency;description;transfer\n"
        "01.06.2026;Cash;;-300,00;RUB;Move to bank;Bank\n"
    ).encode("utf-8")

    r = _preview(client, auth, content, "ops.csv")
    assert r.status_code == 200, r.text
    preview = r.json()
    assert preview["totals"]["ok"] == 1
    assert "Cash" in preview["new_accounts"]
    assert "Bank" in preview["new_accounts"]

    r = client.post("/api/import/confirm", headers=auth, json={
        "import_token": preview["import_token"],
    })
    assert r.status_code == 200, r.text
    assert r.json()["imported"] == 1

    accounts = client.get("/api/accounts/", headers=auth).json()
    by_name = {a["name"]: a for a in accounts}
    assert account_balance(client, auth, by_name["Cash"]["id"]) == -300
    assert account_balance(client, auth, by_name["Bank"]["id"]) == 300


def test_xlsx_import_scans_and_imports_transaction(client, auth):
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.append(["date", "account", "category", "amount", "currency", "description", "transfer"])
    ws.append(["2026-06-02", "Card", "Food\\Groceries", -125.50, "RUB", "Store", ""])

    buf = io.BytesIO()
    wb.save(buf)

    r = _preview(client, auth, buf.getvalue(), "ops.xlsx")
    assert r.status_code == 200, r.text
    preview = r.json()
    assert preview["totals"]["ok"] == 1
    names = {c["name"] for c in preview["new_categories"]}
    assert "food" in names
    assert "food\\groceries" in names

    r = client.post("/api/import/confirm", headers=auth, json={
        "import_token": preview["import_token"],
    })
    assert r.status_code == 200, r.text
    assert r.json()["imported"] == 1
