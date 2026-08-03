from tests.conftest import account_balance, make_account


HEADER = (
    "Дата операции;Дата платежа;Номер карты;Статус;"
    "Сумма операции;Валюта операции;Сумма платежа;Валюта платежа;"
    "Кэшбэк;Категория;MCC;Описание;Бонусы (включая кэшбэк);"
    "Округление на инвесткопилку;Сумма операции с округлением\n"
)


def _preview(client, auth, rows: str):
    return client.post(
        "/api/import/tbank/preview",
        headers=auth,
        files={
            "file": (
                "operations.csv",
                (HEADER + rows).encode("utf-8"),
                "text/csv",
            )
        },
    )


def test_tbank_import_pairs_transfer_maps_accounts_and_deduplicates(
    client,
    auth,
):
    source = make_account(
        client,
        auth,
        name="Тинькофф",
        balance=10_000,
    )
    target = make_account(client, auth, name="Накопительный", balance=0)
    food = client.post(
        "/api/categories/",
        headers=auth,
        json={
            "name": "Продукты",
            "type": "expense",
            "color": "#123456",
        },
    ).json()

    rows = (
        "23.07.2026 13:06:21;23.07.2026;*1111;OK;-500,00;RUB;"
        "-500,00;RUB;;Переводы;;Между своими счетами;0;0;-500,00\n"
        "23.07.2026 13:06:23;23.07.2026;*2222;OK;500,00;RUB;"
        "500,00;RUB;;Переводы;;Между своими счетами;0;0;500,00\n"
        "22.07.2026 10:00:00;22.07.2026;*1111;OK;-100,00;RUB;"
        "-100,00;RUB;;Супермаркеты;5411;Магазин;0;0;-100,00\n"
    )

    response = _preview(client, auth, rows)
    assert response.status_code == 200, response.text
    preview = response.json()
    assert preview["totals"]["source_rows"] == 3
    assert preview["totals"]["operations"] == 2
    assert preview["totals"]["transfers"] == 1
    assert preview["totals"]["duplicates"] == 0

    response = client.post(
        "/api/import/tbank/confirm",
        headers=auth,
        json={
            "import_token": preview["import_token"],
            "account_mappings": {
                "*1111": source["id"],
                "*2222": target["id"],
            },
            "category_mappings": {
                "expense|Супермаркеты": food["id"],
            },
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["imported"] == 2
    assert account_balance(client, auth, source["id"]) == 9_400
    assert account_balance(client, auth, target["id"]) == 500

    second_preview = _preview(client, auth, rows).json()
    assert second_preview["totals"]["duplicates"] == 2
    saved_accounts = {
        item["source_key"]: item["mapped_account_id"]
        for item in second_preview["source_accounts"]
    }
    assert saved_accounts == {
        "*1111": source["id"],
        "*2222": target["id"],
    }
    saved_categories = {
        item["mapping_key"]: item["mapped_category_id"]
        for item in second_preview["source_categories"]
    }
    assert saved_categories["expense|Супермаркеты"] == food["id"]

    response = client.post(
        "/api/import/tbank/confirm",
        headers=auth,
        json={
            "import_token": second_preview["import_token"],
            "account_mappings": saved_accounts,
            "category_mappings": saved_categories,
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["imported"] == 0
    assert response.json()["duplicates"] == 2
    assert account_balance(client, auth, source["id"]) == 9_400
    assert account_balance(client, auth, target["id"]) == 500


def test_tbank_import_skips_rows_without_account_mapping(client, auth):
    make_account(client, auth, name="Карта", balance=0)
    rows = (
        "22.07.2026 16:36:18;22.07.2026;;OK;2500,00;RUB;"
        "2500,00;RUB;;Переводы;;Ульяна С.;0;0;2500,00\n"
    )
    preview = _preview(client, auth, rows).json()

    response = client.post(
        "/api/import/tbank/confirm",
        headers=auth,
        json={
            "import_token": preview["import_token"],
            "account_mappings": {"__without_card__": None},
            "category_mappings": {},
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["imported"] == 0
    assert response.json()["unmapped"] == 1
