import os
import uuid
from decimal import Decimal
from typing import Any, Optional

import httpx


API_URL = "https://api.yookassa.ru/v3"


class YooKassaError(RuntimeError):
    pass


def billing_configured() -> bool:
    return bool(
        os.getenv("YOOKASSA_SHOP_ID")
        and os.getenv("YOOKASSA_SECRET_KEY")
        and family_price() > 0
    )


def family_price() -> Decimal:
    raw = os.getenv("FAMILY_MONTHLY_PRICE_RUB", "0")
    try:
        value = Decimal(raw).quantize(Decimal("0.01"))
    except Exception as exc:
        raise YooKassaError("Некорректно задана стоимость Family") from exc
    if value < 0:
        raise YooKassaError("Стоимость Family не может быть отрицательной")
    return value


def _request(method: str, path: str, *, json: Optional[dict] = None, idempotence_key: Optional[str] = None) -> dict[str, Any]:
    if not billing_configured():
        raise YooKassaError("Оплата пока не настроена")
    headers = {}
    if idempotence_key:
        headers["Idempotence-Key"] = idempotence_key
    try:
        response = httpx.request(
            method,
            f"{API_URL}{path}",
            auth=(os.environ["YOOKASSA_SHOP_ID"], os.environ["YOOKASSA_SECRET_KEY"]),
            headers=headers,
            json=json,
            timeout=15,
        )
        response.raise_for_status()
        return response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise YooKassaError("Платёжный сервис временно недоступен") from exc


def create_initial_payment(*, amount: Decimal, email: str, return_url: str, metadata: dict, idempotence_key: str) -> dict:
    payload = {
        "amount": {"value": f"{amount:.2f}", "currency": "RUB"},
        "capture": True,
        "confirmation": {"type": "redirect", "return_url": return_url},
        "save_payment_method": True,
        "description": "Подписка CaseMoney Family на 1 месяц",
        "metadata": metadata,
    }
    if os.getenv("YOOKASSA_SEND_RECEIPT", "0").lower() in {"1", "true", "yes"}:
        payload["receipt"] = {
            "customer": {"email": email},
            "items": [{
                "description": "Подписка CaseMoney Family на 1 месяц",
                "quantity": "1.00",
                "amount": {"value": f"{amount:.2f}", "currency": "RUB"},
                "vat_code": int(os.getenv("YOOKASSA_VAT_CODE", "1")),
                "payment_mode": "full_payment",
                "payment_subject": "service",
            }],
        }
    return _request("POST", "/payments", json=payload, idempotence_key=idempotence_key)


def create_recurring_payment(*, amount: Decimal, payment_method_id: str, metadata: dict, idempotence_key: str) -> dict:
    return _request("POST", "/payments", json={
        "amount": {"value": f"{amount:.2f}", "currency": "RUB"},
        "capture": True,
        "payment_method_id": payment_method_id,
        "description": "Продление CaseMoney Family на 1 месяц",
        "metadata": metadata,
    }, idempotence_key=idempotence_key)


def get_payment(provider_payment_id: str) -> dict:
    return _request("GET", f"/payments/{provider_payment_id}")


def new_idempotence_key() -> str:
    return str(uuid.uuid4())
