"""Dashboard: common. Callers supply resolved user and database session."""
from sqlalchemy.orm import Session
from typing import Optional
from app.models.transaction import Transaction
from app.services import exchange as exchange_svc



def _to_main(
    db: Session,
    user_id: int,
    amount: float,
    currency: str,
    main: str,
    *,
    transaction: Optional[Transaction] = None,
) -> float:
    """Безопасная конверсия; для истории — по снимку курса операции."""
    if transaction is not None:
        return exchange_svc.convert_transaction_for_user(db, user_id, transaction, main)
    try:
        return exchange_svc.convert_for_user(db, user_id, amount, currency, main)
    except exchange_svc.ExchangeError:
        raise
