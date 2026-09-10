"""Конверсия валют через ЦБ РФ (фиат) и CoinGecko (крипта).

Все курсы имеют вид "1 unit of from_currency = rate * to_currency".
Чтение использует таблицу exchange_rates и кеш памяти с TTL = 24 часа;
полученные от провайдера курсы сохраняются в таблице exchange_rates.
Все конверсии проходят через RUB как pivot.
"""
from decimal import Decimal
from app.money import decimal
import json
import time
import threading
from datetime import datetime, timezone, timedelta
from typing import Optional

import httpx
from sqlalchemy import event
from sqlalchemy.orm import Session

from app.models.exchange_rate import ExchangeRate

CACHE_TTL = timedelta(days=1)

# --- Memo-кэш пользовательских курсов ---
# get_rate_for_user раньше делал 3-5 SQL-запросов (User, UserCurrency x2-4,
# ExchangeRate) на КАЖДУЮ конвертацию. Дашборд/отчёты конвертируют тысячи
# транзакций → десятки тысяч запросов и секунды задержки. Кэшируем результат
# по (user_id, from, to) на короткий TTL — внутри запроса это даёт O(1).
_USER_RATE_TTL = 45  # секунд
_rate_cache_generation = 0

# Один недоступный провайдер не должен задерживать каждый новый тикер на весь
# сетевой timeout. Первый запрос проверяет источник, остальные в течение
# короткой паузы сразу используют stale-курс (или сообщают, что курса ещё нет).
_PROVIDER_RETRY_TTL = 60  # секунд
_provider_failed_at: dict[str, float] = {}
_provider_locks = {"cbr": threading.Lock(), "coingecko": threading.Lock()}


def invalidate_user_rates(user_id: Optional[int] = None) -> None:
    """Invalidate request-local memo caches after currency configuration changes."""
    global _rate_cache_generation
    _rate_cache_generation += 1
    if user_id is None:
        _provider_failed_at.clear()


def _session_rate_cache(db: Session):
    # A rolled-back or uncommitted rate must not leak into another request.
    generation, cache = db.info.get("user_rate_memo", (None, None))
    if generation != _rate_cache_generation:
        cache = {}
        db.info["user_rate_memo"] = (_rate_cache_generation, cache)
    return cache


@event.listens_for(Session, "after_transaction_end")
def _discard_transaction_memo(session, transaction):
    if transaction.parent is None:
        session.info.pop("user_rate_memo", None)


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


def fetch_cbr_to_rub() -> dict[str, Decimal]:
    """Возвращает dict: {CURRENCY: rub_per_1_unit}, плюс RUB=1.0.

    Использует ЦБ РФ. Например JPY (Nominal=100, Value=58) → 0.58 RUB за 1 JPY.
    """
    try:
        r = httpx.get(CBR_URL, timeout=5)
        r.raise_for_status()
        data = json.loads(r.text, parse_float=Decimal)
    except (httpx.HTTPError, ValueError) as e:
        raise ExchangeError(f"CBR fetch failed: {e}") from e

    rates: dict[str, Decimal] = {"RUB": 1}
    for code, info in data.get("Valute", {}).items():
        nominal = decimal(info.get("Nominal") or 1)
        value = decimal(info.get("Value") or 0)
        if nominal > 0 and value > 0:
            rates[code] = value / nominal
    return rates


def fetch_coingecko_to_rub(tickers: list[str]) -> dict[str, Decimal]:
    """Курсы крипты к RUB через CoinGecko. Возвращает {TICKER: rub_per_1_unit}."""
    ids = [CRYPTO_IDS[t] for t in tickers if t in CRYPTO_IDS]
    if not ids:
        return {}
    try:
        r = httpx.get(
            COINGECKO_URL,
            params={"ids": ",".join(ids), "vs_currencies": "rub"},
            timeout=5,
        )
        r.raise_for_status()
        data = json.loads(r.text, parse_float=Decimal)
    except (httpx.HTTPError, ValueError) as e:
        raise ExchangeError(f"CoinGecko fetch failed: {e}") from e

    id_to_ticker = {v: k for k, v in CRYPTO_IDS.items()}
    out: dict[str, Decimal] = {}
    for cg_id, prices in data.items():
        ticker = id_to_ticker.get(cg_id)
        rub = prices.get("rub")
        if ticker and rub:
            out[ticker] = decimal(rub)
    return out


# --------------------------------------------------------------------- cache


def _get_cached(db: Session, from_currency: str, to_currency: str) -> Optional[ExchangeRate]:
    return db.query(ExchangeRate).filter(
        ExchangeRate.from_currency == from_currency,
        ExchangeRate.to_currency == to_currency,
    ).populate_existing().first()


def _save_rate(
    db: Session,
    from_currency: str,
    to_currency: str,
    rate: Decimal,
    source: str,
) -> None:
    # Database upsert prevents concurrent workers from inserting the same pair.
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    from sqlalchemy.dialects.sqlite import insert as sqlite_insert

    insert = pg_insert if db.get_bind().dialect.name == "postgresql" else sqlite_insert
    statement = insert(ExchangeRate).values(
        from_currency=from_currency, to_currency=to_currency,
        rate=rate, source=source, updated_at=_now(),
    )
    db.execute(statement.on_conflict_do_update(
        index_elements=["from_currency", "to_currency"],
        set_={name: getattr(statement.excluded, name) for name in ("rate", "source", "updated_at")},
    ))


def _is_fresh(rate: ExchangeRate) -> bool:
    updated = rate.updated_at
    if updated.tzinfo is None:
        updated = updated.replace(tzinfo=timezone.utc)
    return _now() - updated < CACHE_TTL


# --------------------------------------------------------------------- public API


def get_rate_to_rub(db: Session, currency: str) -> Decimal:
    """Возвращает: 1 unit of currency = X RUB. Использует кэш."""
    currency = currency.upper()
    if currency == "RUB":
        return decimal(1)

    cached = _get_cached(db, currency, "RUB")
    if cached and _is_fresh(cached):
        return cached.rate

    source = "coingecko" if currency in CRYPTO_IDS else "cbr"
    lock = _provider_locks[source]
    with lock:
        # Параллельный запрос мог уже обновить курс, пока мы ждали lock.
        cached = _get_cached(db, currency, "RUB")
        if cached and _is_fresh(cached):
            return cached.rate

        failed_at = _provider_failed_at.get(source)
        if failed_at is not None and time.time() - failed_at < _PROVIDER_RETRY_TTL:
            if cached:
                return cached.rate
            raise ExchangeError(f"{source} temporarily unavailable")

        # Один ответ ЦБ содержит все фиатные курсы, а CoinGecko умеет вернуть
        # все поддерживаемые криптовалюты одним запросом. Сохраняем весь набор,
        # чтобы импорт с несколькими валютами не обращался к сети для каждой.
        try:
            rates = (
                fetch_coingecko_to_rub(list(CRYPTO_IDS))
                if source == "coingecko"
                else fetch_cbr_to_rub()
            )
        except ExchangeError:
            _provider_failed_at[source] = time.time()
            if cached:
                return cached.rate
            raise

        _provider_failed_at.pop(source, None)
        # The caller owns the transaction; never commit unrelated ledger work.
        rates = {code: decimal(rate) for code, rate in rates.items()}
        for code, rate in rates.items():
            if code != "RUB":
                _save_rate(db, code, "RUB", rate, source)
        db.flush()
        db.info["exchange_rates_dirty"] = True

        if currency in rates:
            return decimal(rates[currency])
        if cached:
            return cached.rate
        raise ExchangeError(f"Unknown currency: {currency}")


def get_rate(db: Session, from_currency: str, to_currency: str) -> Decimal:
    """Возвращает: 1 unit of from_currency = X to_currency. Конверсия через RUB."""
    from_currency = from_currency.upper()
    to_currency = to_currency.upper()
    if from_currency == to_currency:
        return decimal(1)
    from_to_rub = get_rate_to_rub(db, from_currency)
    to_to_rub = get_rate_to_rub(db, to_currency)
    return decimal(from_to_rub) / decimal(to_to_rub)


def convert(db: Session, amount: Decimal, from_currency: str, to_currency: str) -> Decimal:
    """Конвертирует amount из from_currency в to_currency (системный курс)."""
    rate = get_rate(db, from_currency, to_currency)
    return round(decimal(amount) * decimal(rate), 2)


def get_rate_for_user(
    db: Session,
    user_id: int,
    from_currency: str,
    to_currency: str,
) -> tuple[Decimal, str]:
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
        return decimal(1), "auto"

    _user_rate_cache = _session_rate_cache(db)
    # memo-кэш: одна и та же пара валют конвертируется тысячи раз за запрос
    cache_key = (user_id, from_cur, to_cur)
    hit = _user_rate_cache.get(cache_key)
    if hit is not None and (time.time() - hit[2]) < _USER_RATE_TTL:
        return hit[0], hit[1]

    user = db.query(User).filter(User.id == user_id).first()
    main = (user.main_currency if user and user.main_currency else "RUB").upper()

    def manual_to_main(currency: str) -> Optional[Decimal]:
        if currency == main:
            return decimal(1)
        uc = db.query(UserCurrency).filter(
            UserCurrency.user_id == user_id,
            UserCurrency.currency == currency,
        ).first()
        if uc and not uc.auto and uc.manual_rate is not None:
            return uc.manual_rate
        return None

    from_manual = manual_to_main(from_cur)
    to_manual = manual_to_main(to_cur)
    # Если оба ручные — рассчитываем напрямую и помечаем как manual
    if from_manual is not None and to_manual is not None:
        result = (from_manual / to_manual, "manual")
        _user_rate_cache[cache_key] = (result[0], result[1], time.time())
        return result

    # Иначе подставляем системные значения для тех валют, где нет ручного
    from_to_main = from_manual if from_manual is not None else get_rate_to_rub(db, from_cur) / get_rate_to_rub(db, main)
    to_to_main = to_manual if to_manual is not None else get_rate_to_rub(db, to_cur) / get_rate_to_rub(db, main)

    rate = decimal(from_to_main) / decimal(to_to_main)
    src = "manual" if (from_manual is not None or to_manual is not None) else "auto"
    _user_rate_cache[cache_key] = (rate, src, time.time())
    return rate, src


def convert_for_user(
    db: Session,
    user_id: int,
    amount: Decimal,
    from_currency: str,
    to_currency: str,
) -> Decimal:
    """Конверсия с учётом ручных курсов пользователя."""
    rate, _ = get_rate_for_user(db, user_id, from_currency, to_currency)
    return round(decimal(amount) * decimal(rate), 2)


def prime_user_rates(
    db: Session,
    user_id: int,
    currencies: set[str] | list[str],
    to_currency: str,
) -> None:
    """Batch-load conversion inputs and seed the short-lived user-rate cache."""
    from app.models.user_currency import UserCurrency
    from app.models.user import User

    _user_rate_cache = _session_rate_cache(db)
    to_cur = to_currency.upper()
    from_currencies = {currency.upper() for currency in currencies}
    missing = set()
    for currency in from_currencies:
        if currency == to_cur:
            continue
        cached = _user_rate_cache.get((user_id, currency, to_cur))
        if cached is None or time.time() - cached[2] >= _USER_RATE_TTL:
            missing.add(currency)
    if not missing:
        return

    user = db.query(User).filter(User.id == user_id).first()
    main = (user.main_currency if user and user.main_currency else "RUB").upper()
    user_currencies = {
        item.currency.upper(): item
        for item in db.query(UserCurrency).filter(
            UserCurrency.user_id == user_id,
        ).all()
    }

    def manual_to_main(currency: str) -> Optional[Decimal]:
        if currency == main:
            return decimal(1)
        item = user_currencies.get(currency)
        if item and not item.auto and item.manual_rate is not None:
            return item.manual_rate
        return None

    required = missing | {to_cur}
    manual_rates = {currency: manual_to_main(currency) for currency in required}
    system_currencies = {
        currency for currency in required if manual_rates[currency] is None
    }
    rub_rates = {}
    for currency in system_currencies:
        try:
            rub_rates[currency] = get_rate_to_rub(db, currency)
        except ExchangeError:
            # The regular serializer preserves its existing zero-value fallback
            # for rates that are unavailable even after stale-cache lookup.
            continue
    try:
        main_to_rub = get_rate_to_rub(db, main)
    except ExchangeError:
        return

    def to_main_rate(currency: str) -> Optional[Decimal]:
        manual = manual_rates[currency]
        if manual is not None:
            return manual
        rub_rate = rub_rates.get(currency)
        return decimal(rub_rate) / decimal(main_to_rub) if rub_rate is not None else None

    target_rate = to_main_rate(to_cur)
    if target_rate is None:
        return
    now = time.time()
    for currency in missing:
        source = (
            "manual"
            if manual_rates[currency] is not None or manual_rates[to_cur] is not None
            else "auto"
        )
        currency_rate = to_main_rate(currency)
        if currency_rate is None:
            continue
        _user_rate_cache[(user_id, currency, to_cur)] = (
            currency_rate / target_rate,
            source,
            now,
        )


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
    db.flush()
    return {"fiat": len(fiat) - 1, "crypto": len(crypto), "saved": saved}


# Public compatibility exports for existing operation and service callers.
from app.services.exchange_snapshots import (
    snapshot_transaction_rates,
    convert_transaction_for_user,
)
