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


def test_import_applies_category_rule_when_row_has_no_category(client, auth):
    categories = client.get("/api/categories/", headers=auth).json()
    groceries_id = next(c["id"] for c in categories if c["name"] == "Продукты" and c["type"] == "expense")
    rule = client.post("/api/automation/rules", headers=auth, json={
        "pattern": "пятёрочка", "category_id": groceries_id,
    })
    assert rule.status_code == 201, rule.text

    content = (
        "date;account;category;amount;currency;description\n"
        "01.06.2026;Cash;;-450,00;RUB;Пятёрочка на неделю\n"
    ).encode("utf-8")
    r = _preview(client, auth, content, "rule-import.csv")
    assert r.status_code == 200, r.text
    preview = r.json()
    assert preview["totals"]["ok"] == 1

    r = client.post("/api/import/confirm", headers=auth, json={
        "import_token": preview["import_token"],
    })
    assert r.status_code == 200, r.text

    transactions = client.get("/api/transactions/", headers=auth).json()["items"]
    imported = next(t for t in transactions if t["description"] == "Пятёрочка на неделю")
    assert imported["category_id"] == groceries_id


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


def test_import_merges_cross_currency_transfer_and_registers_both_currencies(client, auth):
    content = (
        "date;account;category;amount;currency;description;transfer\n"
        "03.06.2026;Cash;;-100,00;USD;Exchange;Bank\n"
        "03.06.2026;Bank;;9000,00;RUB;Exchange;Cash\n"
    ).encode("utf-8")

    r = _preview(client, auth, content, "exchange.csv")
    assert r.status_code == 200, r.text
    preview = r.json()
    assert preview["totals"]["ok"] == 1
    assert preview["totals"]["errors"] == 0
    assert "USD" in preview["currencies_to_add"]

    r = client.post("/api/import/confirm", headers=auth, json={
        "import_token": preview["import_token"],
    })
    assert r.status_code == 200, r.text
    assert r.json()["imported"] == 1

    accounts = client.get("/api/accounts/", headers=auth).json()
    by_name = {a["name"]: a for a in accounts}
    assert account_balance(client, auth, by_name["Cash"]["id"], "USD") == -100
    assert account_balance(client, auth, by_name["Bank"]["id"], "RUB") == 9000

    currencies = client.get("/api/currencies/", headers=auth).json()["currencies"]
    assert {c["currency"] for c in currencies} >= {"RUB", "USD"}


def test_import_merges_multiple_mirrored_transfers_in_source_order(client, auth):
    content = (
        "date;account;category;amount;currency;description;transfer\n"
        "04.06.2026;Cash;;-100,00;USD;First;Bank\n"
        "04.06.2026;Cash;;-200,00;USD;Second;Bank\n"
        "04.06.2026;Bank;;9000,00;RUB;First;Cash\n"
        "04.06.2026;Bank;;18000,00;RUB;Second;Cash\n"
    ).encode("utf-8")

    r = _preview(client, auth, content, "multiple-exchanges.csv")
    assert r.status_code == 200, r.text
    preview = r.json()
    assert preview["totals"]["ok"] == 2
    assert preview["totals"]["errors"] == 0
    assert preview["totals"]["transfers"] == 2


def test_import_repairs_unquoted_newline_in_description(client, auth):
    content = (
        "date;account;category;amount;currency;description;transfer\n"
        "25.04.2014;Wallet;Food;-30,00;UAH;Greens and \n"
        "Eggs;\n"
        "26.04.2014;Wallet;Food;-20,00;UAH;Milk;\n"
    ).encode("utf-8")

    r = _preview(client, auth, content, "wrapped-description.csv")
    assert r.status_code == 200, r.text
    preview = r.json()
    assert preview["totals"]["ok"] == 2
    assert preview["totals"]["errors"] == 0
    assert preview["rows"][0]["description"] == "Greens and Eggs"
