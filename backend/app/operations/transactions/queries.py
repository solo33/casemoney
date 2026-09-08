"""Transactions: queries. Callers supply resolved user and database session."""
from datetime import date, datetime, timedelta, timezone
from app.application import ApplicationError
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from typing import Optional
from app.models.transaction import Transaction, TransactionType
from app.models.category import Category
from app.models.transaction_history import TransactionHistory
from app.models.transaction_tag import Tag
from app.services import family_accounts as family_accounts_svc
from app.operations.transactions.common import _expand_categories
from app.schemas.transactions_views import HistoryPage, TransactionsPage


def get_history(q: Optional[str]=None, action: Optional[str]=None, limit: int=100, offset: int=0, db: Session=None, user_id: int=None):
    """Журнал изменений операций пользователя (новые сверху)."""
    base = db.query(TransactionHistory).filter(TransactionHistory.user_id == user_id)
    if action in ("created", "edited", "deleted"):
        base = base.filter(TransactionHistory.action == action)
    if q:
        like = f"%{q.lower()}%"
        base = base.filter(or_(
            func.lower(TransactionHistory.account_name).like(like),
            func.lower(TransactionHistory.category_name).like(like),
            func.lower(TransactionHistory.description).like(like),
        ))
    total = base.count()
    items = (
        base.order_by(TransactionHistory.changed_at.desc(), TransactionHistory.id.desc())
        .offset(offset).limit(limit).all()
    )
    return HistoryPage(items=items, total=total, limit=limit, offset=offset)


def frequent_categories(tx_type: str='expense', limit: int=8, db: Session=None, user_id: int=None):
    """Most used own categories for the quick-entry form.

    The result is suggestion-only: it never selects or changes a category on
    behalf of the user.  Planned operations are excluded because the goal is
    to make today's entry fast.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=180)
    rows = (
        db.query(Transaction.category_id, func.count(Transaction.id).label("uses"), func.max(Transaction.date).label("last_used"))
        .filter(
            Transaction.user_id == user_id,
            Transaction.type == TransactionType(tx_type),
            Transaction.is_planned.is_(False),
            Transaction.category_id.isnot(None),
            Transaction.date >= cutoff,
        )
        .group_by(Transaction.category_id)
        .order_by(func.count(Transaction.id).desc(), func.max(Transaction.date).desc())
        .limit(limit)
        .all()
    )
    ids = [row.category_id for row in rows]
    categories = {
        item.id: item
        for item in db.query(Category).filter(Category.user_id == user_id, Category.id.in_(ids)).all()
    } if ids else {}
    return [
        {"id": row.category_id, "name": categories[row.category_id].name, "icon": categories[row.category_id].icon,
         "parent_id": categories[row.category_id].parent_id, "uses": row.uses}
        for row in rows if row.category_id in categories
    ]


def get_transactions(account_id: Optional[int]=None, currency: Optional[str]=None, type: Optional[str]=None, category_id: Optional[int]=None, tag_id: Optional[int]=None, date_from: Optional[date]=None, date_to: Optional[date]=None, q: Optional[str]=None, is_planned: Optional[bool]=None, limit: int=50, offset: int=0, db: Session=None, user_id: int=None):
    shared_account_ids = [
        account.id for account in family_accounts_svc.accessible_accounts(db, user_id).all()
        if account.user_id != user_id or account.is_shared
    ]
    visibility_filters = [Transaction.user_id == user_id]
    if shared_account_ids:
        visibility_filters.extend([
            Transaction.account_id.in_(shared_account_ids),
            Transaction.to_account_id.in_(shared_account_ids),
        ])
    query = db.query(Transaction).filter(or_(*visibility_filters))
    normalized_currency = currency.upper() if currency else None
    if account_id and normalized_currency:
        # Перевод хранится одной записью: исходная сторона в account/currency,
        # входящая — в to_account/to_currency. Фильтруем согласованные пары,
        # чтобы валюта другой стороны не попала к выбранному счёту.
        query = query.filter(or_(
            (Transaction.account_id == account_id) &
            (Transaction.currency == normalized_currency),
            (Transaction.to_account_id == account_id) &
            (Transaction.to_currency == normalized_currency),
        ))
    elif account_id:
        query = query.filter(or_(
            Transaction.account_id == account_id,
            Transaction.to_account_id == account_id,
        ))
    elif normalized_currency:
        query = query.filter(or_(
            Transaction.currency == normalized_currency,
            Transaction.to_currency == normalized_currency,
        ))
    if type:
        try:
            query = query.filter(Transaction.type == TransactionType[type])
        except KeyError:
            raise ApplicationError(status_code=400, detail=f"Invalid type: {type}")
    if category_id is not None:
        cat_ids = _expand_categories(db, user_id, category_id)
        query = query.filter(Transaction.category_id.in_(cat_ids))
    if tag_id is not None:
        tag = db.query(Tag).filter(Tag.id == tag_id, Tag.user_id == user_id).first()
        if not tag:
            raise ApplicationError(status_code=404, detail="Метка не найдена")
        query = query.join(Transaction.tags).filter(Tag.id == tag.id)
    if date_from:
        query = query.filter(func.date(Transaction.date) >= date_from)
    if date_to:
        query = query.filter(func.date(Transaction.date) <= date_to)
    if q:
        like = f"%{q.lower()}%"
        query = query.filter(func.lower(Transaction.description).like(like))

    if is_planned is not None:
        query = query.filter(Transaction.is_planned.is_(is_planned))

    total = query.count()
    items = (
        # Financial date remains available for reports and filters, but the
        # journal itself should surface the records the user just changed.
        query.order_by(
            func.coalesce(Transaction.updated_at, Transaction.created_at, Transaction.date).desc(),
            Transaction.id.desc(),
        )
        .offset(offset).limit(limit).all()
    )
    return TransactionsPage(items=items, total=total, limit=limit, offset=offset)
