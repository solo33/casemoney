"""Конверсия валют через ЦБ РФ (фиат) и CoinGecko (крипта).

Все курсы хранятся в виде "1 unit of from_currency = rate * to_currency"
и кэшируются в таблице exchange_rates с TTL = 1 час.
Все конверсии проходят через RUB как pivot.
"""
from datetime import datetime, timezone, timedelta
from typing import Optional

import httpx
from sqlalchemy.orm import Session

from app.models.exchange_rate import ExchangeRate

CACHE_TTL = timedelta(hours=1)
CBR_URL = "https://www.cbr-xml-daily.ru/daily_json.js"
COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price"

# Маппинг тикера → coingecko id
CRYPTO_IDS = {
    "BTC": "bitcoin",
    "ETH": "ethereum",
    "USDT": "tether",
    "USDC": "usd-coin",
    "BNB": "binancecoin",
    "SOL": "solana",
    "TON": "the-open-network",
}


class ExchangeError(Exception):
    """Базовая ошибка работы с курсами."""


def _now() -> datetime:
    return datetime.now(timezone.utc)


# --------------------------------------------------------------------- fetchers


def fetch_cbr_to_rub() -> dict[str, float]:
    """Возвращает dict: {CURRENCY: rub_per_1_unit}, плюс RUB=1.0.

    Использует ЦБ РФ. Например JPY (Nominal=100, Value=58) → 0.58 RUB за 1 JPY.
    """
    try:
        r = httpx.get(CBR_URL, timeout=10.0)
        r.raise_for_status()
        data = r.json()
    except (httpx.HTTPError, ValueError) as e:
        raise ExchangeError(f"CBR fetch failed: {e}") from e

    rates: dict[str, float] = {"RUB": 1.0}
    for code, info in data.get("Valute", {}).items():
        nominal = float(info.get("Nominal") or 1)
        value = float(info.get("Value") or 0)
        if nominal > 0 and value > 0:
            rates[code] = value / nominal
    return rates


def fetch_coingecko_to_rub(tickers: list[str]) -> dict[str, float]:
    """Курсы крипты к RUB через CoinGecko. Возвращает {TICKER: rub_per_1_unit}."""
    ids = [CRYPTO_IDS[t] for t in tickers if t in CRYPTO_IDS]
    if not ids:
        return {}
    try:
        r = httpx.get(
            COINGECKO_URL,
            params={"ids": ",".join(ids), "vs_currencies": "rub"},
            timeout=10.0,
        )
        r.raise_for_status()
        data = r.json()
    except (httpx.HTTPError, ValueError) as e:
        raise ExchangeError(f"CoinGecko fetch failed: {e}") from e

    id_to_ticker = {v: k for k, v in CRYPTO_IDS.items()}
    out: dict[str, float] = {}
    for cg_id, prices in data.items():
        ticker = id_to_ticker.get(cg_id)
        rub = prices.get("rub")
        if ticker and rub:
            out[ticker] = float(rub)
    return out


# --------------------------------------------------------------------- cache


def _get_cached(db: Session, from_currency: str, to_currency: str) -> Optional[ExchangeRate]:
    return db.query(ExchangeRate).filter(
        ExchangeRate.from_currency == from_currency,
        ExchangeRate.to_currency == to_currency,
    ).first()


def _save_rate(
    db: Session,
    from_currency: str,
    to_currency: str,
    rate: float,
    source: str,
) -> None:
    cached = _get_cached(db, from_currency, to_currency)
    now = _now()
    if cached:
        cached.rate = rate
        cached.source = source
        cached.updated_at = now
    else:
        db.add(
            ExchangeRate(
                from_currency=from_currency,
                to_currency=to_currency,
                rate=rate,
                source=source,
                updated_at=now,
            )
        )


def _is_fresh(rate: ExchangeRate) -> bool:
    updated = rate.updated_at
    if updated.tzinfo is None:
        updated = updated.replace(tzinfo=timezone.utc)
    return _now() - updated < CACHE_TTL


# --------------------------------------------------------------------- public API


def get_rate_to_rub(db: Session, currency: str) -> float:
    """Возвращает: 1 unit of currency = X RUB. Использует кэш."""
    currency = currency.upper()
    if currency == "RUB":
        return 1.0

    cached = _get_cached(db, currency, "RUB")
    if cached and _is_fresh(cached):
        return cached.rate

    # Refresh: фиат через CBR, крипта через CoinGecko
    if currency in CRYPTO_IDS:
        rates = fetch_coingecko_to_rub([currency])
        source = "coingecko"
    else:
        rates = fetch_cbr_to_rub()
        source = "cbr"

    if currency not in rates:
        # Если в источнике нет валюты — возвращаем stale, если есть, иначе ошибка
        if cached:
            return cached.rate
        raise ExchangeError(f"Unknown currency: {currency}")

    rate = rates[currency]
    _save_rate(db, currency, "RUB", rate, source)
    db.commit()
    return rate


def get_rate(db: Session, from_currency: str, to_currency: str) -> float:
    """Возвращает: 1 unit of from_currency = X to_currency. Конверсия через RUB."""
    from_currency = from_currency.upper()
    to_currency = to_currency.upper()
    if from_currency == to_currency:
        return 1.0
    from_to_rub = get_rate_to_rub(db, from_currency)
    to_to_rub = get_rate_to_rub(db, to_currency)
    return from_to_rub / to_to_rub


def convert(db: Session, amount: float, from_currency: str, to_currency: str) -> float:
    """Конвертирует amount из from_currency в to_currency (системный курс)."""
    rate = get_rate(db, from_currency, to_currency)
    return round(amount * rate, 2)


def get_rate_for_user(
    db: Session,
    user_id: int,
    from_currency: str,
    to_currency: str,
) -> tuple[float, str]:
    """Возвращает (rate, source) для конкретного пользователя.

    Если у user_currencies[from_currency] auto=False и manual_rate задан — используем его
    (manual_rate интерпретируется как 1 from_currency = manual_rate * main_currency).
    Иначе системный курс через get_rate.
    """
    from app.models.user_currency import UserCurrency  # позднее, чтобы не было циклов
    from app.models.user import User

    from_cur = from_currency.upper()
    to_cur = to_currency.upper()
    if from_cur == to_cur:
        return 1.0, "auto"

    user = db.query(User).filter(User.id == user_id).first()
    main = (user.main_currency if user and user.main_currency else "RUB").upper()

    def manual_to_main(currency: str) -> Optional[float]:
        if currency == main:
            return 1.0
        uc = db.query(UserCurrency).filter(
            UserCurrency.user_id == user_id,
            UserCurrency.currency == currency,
        ).first()
        if uc and not uc.auto and uc.manual_rate is not None:
            return uc.manual_rate
        return None

    from_to_main = manual_to_main(from_cur)
    to_to_main = manual_to_main(to_cur)
    # Если оба ручные — рассчитываем напрямую и помечаем как manual
    if from_to_main is not None and to_to_main is not None:
        return from_to_main / to_to_main, "manual"

    # Иначе подставляем системные значения для тех валют, где нет ручного
    if from_to_main is None:
        from_to_main = get_rate_to_rub(db, from_cur) / get_rate_to_rub(db, main)
    if to_to_main is None:
        to_to_main = get_rate_to_rub(db, to_cur) / get_rate_to_rub(db, main)

    rate = from_to_main / to_to_main
    src = "manual" if (
        manual_to_main(from_cur) is not None or manual_to_main(to_cur) is not None
    ) else "auto"
    return rate, src


def convert_for_user(
    db: Session,
    user_id: int,
    amount: float,
    from_currency: str,
    to_currency: str,
) -> float:
    """Конверсия с учётом ручных курсов пользователя."""
    rate, _ = get_rate_for_user(db, user_id, from_currency, to_currency)
    return round(amount * rate, 2)


def refresh_all_rates(db: Session) -> dict[str, int]:
    """Принудительно обновить все ходовые курсы. Возвращает счётчики."""
    fiat = fetch_cbr_to_rub()
    crypto = fetch_coingecko_to_rub(list(CRYPTO_IDS.keys()))

    saved = 0
    for code, rate in fiat.items():
        if code == "RUB":
            continue
        _save_rate(db, code, "RUB", rate, "cbr")
        saved += 1
    for code, rate in crypto.items():
        _save_rate(db, code, "RUB", rate, "coingecko")
        saved += 1
    db.commit()
    return {"fiat": len(fiat) - 1, "crypto": len(crypto), "saved": saved}
