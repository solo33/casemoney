"""Конверсия валют через ЦБ РФ (фиат) и CoinGecko (крипта).

Все курсы хранятся в виде "1 unit of from_currency = rate * to_currency"
и кэшируются в таблице exchange_rates с TTL = 24 часа.
Все конверсии проходят через RUB как pivot.
"""
import time
import threading
from datetime import datetime, timezone, timedelta
from typing import Optional

import httpx
from sqlalchemy.orm import Session

from app.models.exchange_rate import ExchangeRate

CACHE_TTL = timedelta(days=1)

# --- Memo-кэш пользовательских курсов ---
# get_rate_for_user раньше делал 3-5 SQL-запросов (User, UserCurrency x2-4,
# ExchangeRate) на КАЖДУЮ конвертацию. Дашборд/отчёты конвертируют тысячи
# транзакций → десятки тысяч запросов и секунды задержки. Кэшируем результат
# по (user_id, from, to) на короткий TTL — внутри запроса это даёт O(1).
_USER_RATE_TTL = 45  # секунд
_user_rate_cache: dict[tuple[int, str, str], tuple[float, str, float]] = {}

# Один недоступный провайдер не должен задерживать каждый новый тикер на весь
# сетевой timeout. Первый запрос проверяет источник, остальные в течение
# короткой паузы сразу используют stale-курс (или сообщают, что курса ещё нет).
_PROVIDER_RETRY_TTL = 60  # секунд
_provider_failed_at: dict[str, float] = {}
_provider_locks = {"cbr": threading.Lock(), "coingecko": threading.Lock()}


def invalidate_user_rates(user_id: Optional[int] = None) -> None:
    """Сбросить memo-кэш курсов. Вызывать при смене основной валюты или ручного курса."""
    if user_id is None:
        _user_rate_cache.clear()
        _provider_failed_at.clear()
        return
    for key in [k for k in _user_rate_cache if k[0] == user_id]:
        _user_rate_cache.pop(key, None)
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
        r = httpx.get(CBR_URL, timeout=5.0)
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
            timeout=5.0,
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
        for code, rate in rates.items():
            if code != "RUB":
                _save_rate(db, code, "RUB", rate, source)
        # Не коммитим из сервиса курса: он может вызываться внутри создания
        # операции. Окончательный commit сделает обработчик запроса, сохранив
        # операцию, её курс и изменение остатка атомарно.
        db.flush()
        db.info["exchange_rates_dirty"] = True

        if currency in rates:
            return rates[currency]
        if cached:
            return cached.rate
        raise ExchangeError(f"Unknown currency: {currency}")


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

    # memo-кэш: одна и та же пара валют конвертируется тысячи раз за запрос
    cache_key = (user_id, from_cur, to_cur)
    hit = _user_rate_cache.get(cache_key)
    if hit is not None and (time.time() - hit[2]) < _USER_RATE_TTL:
        return hit[0], hit[1]

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

    rate = from_to_main / to_to_main
    src = "manual" if (from_manual is not None or to_manual is not None) else "auto"
    _user_rate_cache[cache_key] = (rate, src, time.time())
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


def snapshot_transaction_rates(db: Session, user_id: int, transaction, *, force: bool = False) -> bool:
    """Сохраняет оценку сторон операции в основной валюте пользователя.

    Снимок намеренно лежит в самой операции: одна и та же историческая
    операция не должна менять сумму в отчёте из-за сегодняшнего курса. Если
    внешний источник временно недоступен, поле остаётся пустым — следующий
    отчёт повторит попытку и сохранит первый доступный курс.
    """
    from app.models.user import User

    user = db.query(User).filter(User.id == user_id).first()
    main = (user.main_currency if user and user.main_currency else "RUB").upper()
    changed = False
    valuation_changed = (transaction.valuation_currency or "").upper() != main

    def capture(currency: str):
        try:
            return get_rate_for_user(db, user_id, currency, main)
        except ExchangeError:
            return None

    if force or transaction.exchange_rate is None or valuation_changed:
        source = capture(transaction.currency)
        if source is not None:
            rate, rate_source = source
            transaction.valuation_currency = main
            transaction.exchange_rate = rate
            transaction.exchange_rate_source = rate_source
            changed = True

    if transaction.type.value == "transfer" and transaction.to_currency:
        if force or transaction.to_exchange_rate is None or valuation_changed:
            destination = capture(transaction.to_currency)
            if destination is not None:
                rate, rate_source = destination
                transaction.valuation_currency = main
                transaction.to_exchange_rate = rate
                transaction.to_exchange_rate_source = rate_source
                changed = True
    elif transaction.to_exchange_rate is not None or transaction.to_exchange_rate_source is not None:
        transaction.to_exchange_rate = None
        transaction.to_exchange_rate_source = None
        changed = True

    if changed:
        # GET-отчёты делают ленивую миграцию старых строк. Флаг позволяет
        # закоммитить все заполненные снимки одной транзакцией в get_db().
        db.info["transaction_exchange_snapshots_dirty"] = True
    return changed


def convert_transaction_for_user(
    db: Session,
    user_id: int,
    transaction,
    to_currency: str,
    *,
    destination: bool = False,
) -> float:
    """Конвертирует сторону операции по сохранённому снимку курса.

    Для старых строк без снимка курс определяется единожды и сохраняется.
    При смене основной валюты после операции используем сохранённую оценку
    как промежуточную валюту и конвертируем её в новую основную валюту.
    """
    target = to_currency.upper()
    amount = transaction.to_amount if destination else transaction.amount
    currency = transaction.to_currency if destination else transaction.currency
    rate = transaction.to_exchange_rate if destination else transaction.exchange_rate
    valuation = (transaction.valuation_currency or "").upper()

    if amount is None or not currency:
        return 0.0
    if rate is None or not valuation:
        snapshot_transaction_rates(db, user_id, transaction)
        rate = transaction.to_exchange_rate if destination else transaction.exchange_rate
        valuation = (transaction.valuation_currency or "").upper()

    if rate is not None and valuation:
        valued = float(amount) * float(rate)
        if valuation == target:
            return round(valued, 2)
        try:
            return convert_for_user(db, user_id, valued, valuation, target)
        except ExchangeError:
            return 0.0
    try:
        return convert_for_user(db, user_id, float(amount), currency, target)
    except ExchangeError:
        return 0.0


def prime_user_rates(
    db: Session,
    user_id: int,
    currencies: set[str] | list[str],
    to_currency: str,
) -> None:
    """Batch-load conversion inputs and seed the short-lived user-rate cache."""
    from app.models.user_currency import UserCurrency
    from app.models.user import User

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

    def manual_to_main(currency: str) -> Optional[float]:
        if currency == main:
            return 1.0
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

    def to_main_rate(currency: str) -> Optional[float]:
        manual = manual_rates[currency]
        if manual is not None:
            return manual
        rub_rate = rub_rates.get(currency)
        return rub_rate / main_to_rub if rub_rate is not None else None

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
    db.info["exchange_rates_dirty"] = True
    return {"fiat": len(fiat) - 1, "crypto": len(crypto), "saved": saved}
