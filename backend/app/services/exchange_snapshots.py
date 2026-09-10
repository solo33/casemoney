"""Historical valuation policy, separate from provider lookup and rate caching.

Missing snapshots use the first available rate; saved sides remain stable.
Missing legacy snapshots are prepared before reports and saved by the read boundary.
"""
from decimal import Decimal
from sqlalchemy.orm import Session
from app.money import decimal


def snapshot_transaction_rates(db: Session, user_id: int, transaction, *, force: bool = False) -> bool:
    """Сохраняет оценку сторон операции в основной валюте пользователя.

    Снимок намеренно лежит в самой операции: одна и та же историческая
    операция не должна менять сумму в отчёте из-за сегодняшнего курса. Если
    внешний источник временно недоступен, поле остаётся пустым; следующая подготовка отчёта повторит попытку.
    """
    from app.models.user import User
    from app.services import exchange

    user = db.query(User).filter(User.id == user_id).first()
    main = (user.main_currency if user and user.main_currency else "RUB").upper()
    # A missing transfer side must use the same valuation as its saved side.
    # Only an explicit force refresh may replace an existing valuation.
    if not force and transaction.valuation_currency:
        main = transaction.valuation_currency.upper()
    changed = False
    valuation_changed = (transaction.valuation_currency or "").upper() != main

    def capture(currency: str):
        try:
            return exchange.get_rate_for_user(db, user_id, currency, main)
        except exchange.ExchangeError:
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
        db.info["transaction_exchange_snapshots_dirty"] = True
    return changed


def convert_transaction_for_user(
    db: Session,
    user_id: int,
    transaction,
    to_currency: str,
    *,
    destination: bool = False,
) -> Decimal:
    """Конвертирует сторону операции по сохранённому снимку курса.

    Для старых строк недостающий снимок закрепляется при первом доступном курсе.
    При смене основной валюты после операции используем сохранённую оценку
    как промежуточную валюту и конвертируем её в новую основную валюту.
    """
    from app.services import exchange

    target = to_currency.upper()
    amount = transaction.to_amount if destination else transaction.amount
    currency = transaction.to_currency if destination else transaction.currency
    rate = transaction.to_exchange_rate if destination else transaction.exchange_rate
    valuation = (transaction.valuation_currency or "").upper()

    if amount is None or not currency:
        return 0
    if rate is None or not valuation:
        snapshot_transaction_rates(db, user_id, transaction)
        rate = transaction.to_exchange_rate if destination else transaction.exchange_rate
        valuation = (transaction.valuation_currency or "").upper()

    if rate is not None and valuation:
        valued = decimal(amount) * decimal(rate)
        if valuation == target:
            return round(valued, 2)
        try:
            return exchange.convert_for_user(db, user_id, valued, valuation, target)
        except exchange.ExchangeError:
            raise
    try:
        return exchange.convert_for_user(db, user_id, decimal(amount), currency, target)
    except exchange.ExchangeError:
        raise
