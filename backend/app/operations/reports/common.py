"""Reports: common. Callers supply resolved user and database session."""
from fastapi import HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, date, timezone
from typing import Optional
from calendar import monthrange
from app.models.transaction import Transaction
from app.services import exchange as exchange_svc



RU_MONTHS = ["", "январь", "февраль", "март", "апрель", "май", "июнь",
             "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"]


def _to_main(
    db: Session,
    user_id: int,
    amount: float,
    currency: str,
    main: str,
    *,
    transaction: Optional[Transaction] = None,
    destination: bool = False,
) -> float:
    """Оценка суммы в основной валюте.

    У фактической операции всегда предпочитаем сохранённый снимок курса.
    Голая сумма используется только там, где операции ещё нет (например,
    текущий баланс счёта) или для старой совместимости.
    """
    if transaction is not None:
        return exchange_svc.convert_transaction_for_user(
            db, user_id, transaction, main, destination=destination
        )
    try:
        return exchange_svc.convert_for_user(db, user_id, amount, currency, main)
    except exchange_svc.ExchangeError:
        raise


def resolve_period(
    period: str,
    year: Optional[int],
    month: Optional[int],
    quarter: Optional[int],
    date_from: Optional[date],
    date_to: Optional[date],
) -> tuple[date, date, str]:
    now = datetime.now(timezone.utc)
    y = year or now.year

    if period == "month":
        m = month or now.month
        if not 1 <= m <= 12:
            raise HTTPException(status_code=400, detail="month должен быть 1..12")
        last_day = monthrange(y, m)[1]
        return date(y, m, 1), date(y, m, last_day), f"{RU_MONTHS[m].capitalize()} {y}"

    if period == "quarter":
        q = quarter or ((now.month - 1) // 3 + 1)
        if not 1 <= q <= 4:
            raise HTTPException(status_code=400, detail="quarter должен быть 1..4")
        start_month = (q - 1) * 3 + 1
        end_month = start_month + 2
        last_day = monthrange(y, end_month)[1]
        return date(y, start_month, 1), date(y, end_month, last_day), f"{q} квартал {y}"

    if period == "year":
        return date(y, 1, 1), date(y, 12, 31), f"{y} год"

    if period == "custom":
        if not date_from or not date_to:
            raise HTTPException(status_code=400, detail="date_from и date_to обязательны для custom")
        if date_from > date_to:
            raise HTTPException(status_code=400, detail="date_from > date_to")
        return date_from, date_to, f"{date_from.strftime('%d.%m.%Y')} — {date_to.strftime('%d.%m.%Y')}"

    raise HTTPException(status_code=400, detail=f"Неизвестный period: {period}")


def _parse_ids(csv: Optional[str]) -> Optional[set[int]]:
    if not csv:
        return None
    out = set()
    for part in csv.split(","):
        part = part.strip()
        if part.isdigit():
            out.add(int(part))
    return out or None
