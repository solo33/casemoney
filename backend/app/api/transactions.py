from datetime import date, datetime, timedelta, timezone
import hashlib
import json

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from typing import List, Optional
from pydantic import BaseModel

from app.database import get_db
from app.models.transaction import Transaction, TransactionType
from app.models.account import Account
from app.models.account_balance import AccountBalance
from app.models.category import Category
from app.models.transaction_history import TransactionHistory
from app.models.family import FamilyMember
from app.models.user import User
from app.schemas.transaction import (
    TransactionCreate,
    TransactionUpdate,
    TransactionResponse,
    TransactionBulkCategoryUpdate,
    TransactionBulkUpdateResult,
)
from app.services.auth import decode_token
from app.services import accounts as accounts_svc
from app.services import exchange as exchange_svc
from app.services.plans import ensure_family_plan
from app.services.automation import matched_category_id

router = APIRouter(prefix="/api/transactions", tags=["transactions"])
security = HTTPBearer()


def _request_hash(data: TransactionCreate) -> str:
    canonical = json.dumps(
        data.model_dump(mode="json"),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _existing_idempotent_transaction(
    db: Session,
    user_id: int,
    request_id: str,
    request_hash: str,
) -> Optional[Transaction]:
    transaction = db.query(Transaction).filter(
        Transaction.user_id == user_id,
        Transaction.client_request_id == request_id,
    ).first()
    if transaction and transaction.client_request_hash != request_hash:
        raise HTTPException(
            status_code=409,
            detail="Ключ повтора уже использован для другой операции.",
        )
    return transaction


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> int:
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    return int(payload["sub"])


def _apply_to_balance(
    bal: AccountBalance, tx_type: TransactionType, amount: float, reverse: bool = False
) -> None:
    """Применяет/отменяет дельту дохода/расхода к одному балансу."""
    sign = -1 if reverse else 1
    if tx_type == TransactionType.income:
        bal.balance += sign * amount
    elif tx_type == TransactionType.expense:
        bal.balance -= sign * amount


def _apply_tx_effect(db: Session, tx: Transaction, reverse: bool = False) -> None:
    """Применяет (или откатывает при reverse=True) эффект всей операции на балансы.

    income  → счёт +amount
    expense → счёт −amount
    transfer→ счёт-источник −amount, счёт-получатель +to_amount (двусторонний перевод)
    """
    if tx.is_planned:
        return
    sign = -1 if reverse else 1
    if tx.type == TransactionType.income:
        bal = accounts_svc.get_or_create_balance(db, tx.account_id, tx.currency)
        bal.balance += sign * tx.amount
    elif tx.type == TransactionType.expense:
        bal = accounts_svc.get_or_create_balance(db, tx.account_id, tx.currency)
        bal.balance -= sign * tx.amount
    elif tx.type == TransactionType.transfer:
        # списание с источника
        src = accounts_svc.get_or_create_balance(db, tx.account_id, tx.currency)
        src.balance -= sign * tx.amount
        # зачисление на получателя
        if tx.to_account_id and tx.to_currency and tx.to_amount is not None:
            dst = accounts_svc.get_or_create_balance(db, tx.to_account_id, tx.to_currency)
            dst.balance += sign * tx.to_amount


def _category_path(db: Session, user_id: int, category_id: Optional[int]) -> Optional[str]:
    if not category_id:
        return None
    c = db.query(Category).filter(Category.id == category_id, Category.user_id == user_id).first()
    if not c:
        return None
    if c.parent_id:
        p = db.query(Category).filter(Category.id == c.parent_id).first()
        return f"{p.name}\\{c.name}" if p else c.name
    return c.name


def _ensure_own_category(db: Session, user_id: int, category_id: int) -> None:
    """Категория в транзакции должна принадлежать этому пользователю."""
    cat = db.query(Category).filter(
        Category.id == category_id, Category.user_id == user_id
    ).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")


def _ensure_expense_category(db: Session, user_id: int, category_id: int) -> None:
    category = db.query(Category).filter(
        Category.id == category_id, Category.user_id == user_id
    ).first()
    if not category or category.type != "expense":
        raise HTTPException(status_code=400, detail="Для комиссии выберите категорию расхода")


def _sync_transfer_fee(
    db: Session,
    transfer: Transaction,
    *,
    fee_amount: Optional[float],
    fee_category_id: Optional[int],
) -> None:
    """Create/update the expense row that represents a bank transfer fee."""
    fees = db.query(Transaction).filter(
        Transaction.linked_transfer_id == transfer.id,
        Transaction.user_id == transfer.user_id,
    ).all()
    fee = fees[0] if fees else None
    active = fee_amount is not None and float(fee_amount) > 0
    if active and not fee_category_id:
        raise HTTPException(status_code=400, detail="Укажите категорию комиссии")
    if active:
        _ensure_expense_category(db, transfer.user_id, fee_category_id)
    transfer.fee_amount = round(float(fee_amount), 2) if active else None
    transfer.fee_category_id = fee_category_id if active else None
    if fee:
        _apply_tx_effect(db, fee, reverse=True)
        if not active:
            _write_history(db, transfer.user_id, fee, "deleted")
            db.delete(fee)
            return
        fee.amount = round(float(fee_amount), 2)
        fee.currency = transfer.currency
        fee.category_id = fee_category_id
        fee.description = f"Комиссия перевода: {transfer.description or 'без описания'}"
        fee.date = transfer.date
        fee.account_id = transfer.account_id
        fee.is_planned = transfer.is_planned
        exchange_svc.snapshot_transaction_rates(
            db, transfer.user_id, fee, force=True
        )
        _apply_tx_effect(db, fee)
        _write_history(db, transfer.user_id, fee, "edited")
        return
    if active:
        fee = Transaction(
            amount=round(float(fee_amount), 2), currency=transfer.currency,
            type=TransactionType.expense,
            description=f"Комиссия перевода: {transfer.description or 'без описания'}",
            date=transfer.date, account_id=transfer.account_id,
            category_id=fee_category_id, user_id=transfer.user_id,
            linked_transfer_id=transfer.id, is_planned=transfer.is_planned,
        )
        db.add(fee)
        db.flush()
        exchange_svc.snapshot_transaction_rates(db, transfer.user_id, fee)
        _apply_tx_effect(db, fee)
        _write_history(db, transfer.user_id, fee, "created")


def _account_name(db: Session, account_id: int) -> str:
    a = db.query(Account).filter(Account.id == account_id).first()
    return a.name if a else "—"


def _resolve_transfer_dest(db: Session, user_id: int, src_currency: str, src_amount: float,
                           to_account_id, to_currency, to_amount):
    """Готовит (to_account_id, to_currency, to_amount) для перевода.

    Валидирует счёт-получатель. Если сумма зачисления не задана — вычисляет:
    та же валюта → та же сумма; иначе конвертирует по курсу пользователя.
    """
    if not to_account_id:
        raise HTTPException(status_code=400, detail="Для перевода укажите счёт-получатель")
    dst = db.query(Account).filter(Account.id == to_account_id, Account.user_id == user_id).first()
    if not dst:
        raise HTTPException(status_code=404, detail="Счёт-получатель не найден")
    cur = (to_currency or src_currency).upper()
    if to_amount is None:
        if cur == src_currency.upper():
            to_amount = src_amount
        else:
            try:
                to_amount = exchange_svc.convert_for_user(db, user_id, src_amount, src_currency, cur)
            except exchange_svc.ExchangeError:
                to_amount = src_amount
    return to_account_id, cur, round(float(to_amount), 2)


def _write_history(db: Session, user_id: int, tx: Transaction, action: str,
                   prev_amount: Optional[float] = None, prev_currency: Optional[str] = None) -> None:
    """Записать событие в журнал изменений (денормализованный снимок)."""
    # Для перевода вместо категории показываем счёт-получатель
    if tx.type == TransactionType.transfer and tx.to_account_id:
        category_name = _account_name(db, tx.to_account_id)
    else:
        category_name = _category_path(db, user_id, tx.category_id)

    db.add(TransactionHistory(
        user_id=user_id,
        transaction_id=tx.id,
        action=action,
        op_date=tx.date,
        type=tx.type.value,
        amount=tx.amount,
        currency=tx.currency,
        account_name=_account_name(db, tx.account_id),
        category_name=category_name,
        description=tx.description,
        prev_amount=prev_amount,
        prev_currency=prev_currency,
    ))


def _expand_categories(db: Session, user_id: int, category_id: int) -> list[int]:
    """Возвращает category_id + все дочерние (для иерархического фильтра)."""
    children = db.query(Category.id).filter(
        Category.user_id == user_id,
        Category.parent_id == category_id,
    ).all()
    return [category_id] + [c[0] for c in children]


def _family_fields(
    db: Session,
    user_id: int,
    tx_type: TransactionType,
    amount: float,
    is_family_expense: bool,
    reimbursement_amount: Optional[float],
) -> tuple[Optional[int], bool, float]:
    if not is_family_expense:
        return None, False, 0
    user = db.query(User).filter(User.id == user_id).first()
    if not user or user.plan != "family":
        raise HTTPException(
            status_code=403,
            detail="Семейные расходы доступны только на тарифе Family",
        )
    if tx_type != TransactionType.expense:
        raise HTTPException(
            status_code=400,
            detail="Семейной можно отметить только расходную операцию",
        )
    membership = db.query(FamilyMember).filter(
        FamilyMember.user_id == user_id,
        FamilyMember.status == "active",
    ).first()
    if not membership:
        raise HTTPException(
            status_code=400,
            detail="Сначала создайте или примите семейное пространство",
        )
    reimbursable = amount if reimbursement_amount is None else reimbursement_amount
    if reimbursable < 0 or reimbursable > amount:
        raise HTTPException(
            status_code=400,
            detail="Сумма к возмещению должна быть от 0 до суммы расхода",
        )
    return membership.family_id, True, float(reimbursable)


class TransactionsPage(BaseModel):
    items: List[TransactionResponse]
    total: int
    limit: int
    offset: int


class HistoryItem(BaseModel):
    id: int
    transaction_id: Optional[int]
    action: str
    changed_at: datetime
    op_date: Optional[datetime]
    type: str
    amount: float
    currency: str
    account_name: Optional[str]
    category_name: Optional[str]
    description: Optional[str]
    prev_amount: Optional[float]
    prev_currency: Optional[str]

    class Config:
        from_attributes = True


class HistoryPage(BaseModel):
    items: List[HistoryItem]
    total: int
    limit: int
    offset: int


@router.get("/history", response_model=HistoryPage)
def get_history(
    q: Optional[str] = Query(None, description="Поиск по счёту, категории, примечанию"),
    action: Optional[str] = Query(None, description="created | edited | deleted"),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
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


@router.get("/frequent-categories")
def frequent_categories(
    tx_type: str = Query("expense", pattern="^(income|expense)$"),
    limit: int = Query(8, ge=1, le=12),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
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


@router.get("/", response_model=TransactionsPage)
def get_transactions(
    account_id: Optional[int] = Query(None),
    currency: Optional[str] = Query(None),
    type: Optional[str] = Query(None, description="income | expense | transfer"),
    category_id: Optional[int] = Query(None, description="вкл. подкатегории"),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    q: Optional[str] = Query(None, description="Поиск в описании"),
    is_planned: Optional[bool] = Query(None, description="Planned or actual operations"),
    limit: int = Query(50, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    query = db.query(Transaction).filter(Transaction.user_id == user_id)
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
            raise HTTPException(status_code=400, detail=f"Invalid type: {type}")
    if category_id is not None:
        cat_ids = _expand_categories(db, user_id, category_id)
        query = query.filter(Transaction.category_id.in_(cat_ids))
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
        query.order_by(Transaction.date.desc(), Transaction.id.desc())
        .offset(offset).limit(limit).all()
    )
    return TransactionsPage(items=items, total=total, limit=limit, offset=offset)


@router.post("/", response_model=TransactionResponse, status_code=201)
def create_transaction(
    data: TransactionCreate,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    request_id = idempotency_key.strip() if idempotency_key else None
    if request_id and len(request_id) > 64:
        raise HTTPException(status_code=400, detail="Слишком длинный ключ повтора.")
    request_hash = _request_hash(data) if request_id else None
    if request_id:
        existing = _existing_idempotent_transaction(
            db, user_id, request_id, request_hash
        )
        if existing:
            return existing

    account = db.query(Account).filter(
        Account.id == data.account_id, Account.user_id == user_id
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    try:
        tx_type = TransactionType[data.type]
    except KeyError:
        raise HTTPException(status_code=400, detail=f"Invalid type: {data.type}")

    if data.currency:
        currency = data.currency.upper()
    elif account.balances:
        currency = account.balances[0].currency
    else:
        currency = accounts_svc.get_user_main_currency(db, user_id)

    to_account_id = to_amount = to_currency = None
    if tx_type == TransactionType.transfer:
        to_account_id, to_currency, to_amount = _resolve_transfer_dest(
            db, user_id, currency, data.amount,
            data.to_account_id, data.to_currency, data.to_amount,
        )

    category_id = data.category_id
    user = None
    if category_id is None and tx_type != TransactionType.transfer:
        user = db.query(User).filter(User.id == user_id).first()
    if category_id is None and tx_type != TransactionType.transfer and user and user.automation_rules_enabled:
        category_id = matched_category_id(db, user_id, data.description, tx_type.value)
    if category_id is not None and tx_type != TransactionType.transfer:
        _ensure_own_category(db, user_id, category_id)

    if data.is_planned:
        ensure_family_plan(db, user_id)

    family_id, is_family_expense, reimbursement_amount = _family_fields(
        db,
        user_id,
        tx_type,
        data.amount,
        data.is_family_expense,
        data.reimbursement_amount,
    )
    transaction = Transaction(
        amount=data.amount,
        currency=currency,
        type=tx_type,
        description=data.description,
        date=data.date,
        account_id=data.account_id,
        category_id=None if tx_type == TransactionType.transfer else category_id,
        user_id=user_id,
        to_account_id=to_account_id,
        to_amount=to_amount,
        to_currency=to_currency,
        client_request_id=request_id,
        client_request_hash=request_hash,
        family_id=family_id,
        is_family_expense=is_family_expense,
        reimbursement_amount=reimbursement_amount,
        is_planned=data.is_planned,
    )
    db.add(transaction)
    exchange_svc.snapshot_transaction_rates(db, user_id, transaction)
    try:
        db.flush()
        _apply_tx_effect(db, transaction, reverse=False)
        _write_history(db, user_id, transaction, "created")
        if tx_type == TransactionType.transfer:
            _sync_transfer_fee(
                db, transaction,
                fee_amount=data.fee_amount,
                fee_category_id=data.fee_category_id,
            )
        db.commit()
    except IntegrityError:
        db.rollback()
        if request_id:
            existing = _existing_idempotent_transaction(
                db, user_id, request_id, request_hash
            )
            if existing:
                return existing
        raise
    db.refresh(transaction)
    return transaction


@router.patch("/bulk/category", response_model=TransactionBulkUpdateResult)
def bulk_update_category(
    data: TransactionBulkCategoryUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Categorise a selection of historic income or expense rows.

    Transfers are deliberately excluded: a transfer has no category and changing
    it here would make the ledger misleading.  The selected rows must have one
    type, because an income category cannot be applied to an expense (and vice
    versa).
    """
    ids = list(dict.fromkeys(data.transaction_ids))
    rows = (
        db.query(Transaction)
        .filter(Transaction.user_id == user_id, Transaction.id.in_(ids))
        .all()
    )
    if len(rows) != len(ids):
        raise HTTPException(status_code=404, detail="Часть выбранных записей не найдена.")
    types = {row.type for row in rows}
    if len(types) != 1 or TransactionType.transfer in types:
        raise HTTPException(
            status_code=400,
            detail="Можно изменить категорию только у записей одного типа: доходов или расходов.",
        )

    category = None
    if data.category_id is not None:
        category = db.query(Category).filter(
            Category.id == data.category_id,
            Category.user_id == user_id,
        ).first()
        if not category:
            raise HTTPException(status_code=404, detail="Категория не найдена.")
        if category.type != next(iter(types)).value:
            raise HTTPException(status_code=400, detail="Тип категории не совпадает с выбранными записями.")

    for row in rows:
        if row.category_id == data.category_id:
            continue
        prev_amount, prev_currency = row.amount, row.currency
        row.category_id = data.category_id
        _write_history(
            db, user_id, row, "edited",
            prev_amount=prev_amount, prev_currency=prev_currency,
        )
    db.commit()
    return TransactionBulkUpdateResult(updated=len(rows))


@router.patch("/{transaction_id}", response_model=TransactionResponse)
def update_transaction(
    transaction_id: int,
    data: TransactionUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Редактирование транзакции. Балансы пересчитываются корректно:
    откат старого эффекта → применение нового."""
    tx = db.query(Transaction).filter(
        Transaction.id == transaction_id, Transaction.user_id == user_id
    ).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    update = data.model_dump(exclude_unset=True)
    rate_relevant_fields = {
        "amount", "currency", "date", "type", "account_id",
        "to_account_id", "to_amount", "to_currency",
    }
    refresh_rate_snapshot = bool(rate_relevant_fields & set(update))
    fee_amount_supplied = "fee_amount" in update
    fee_category_supplied = "fee_category_id" in update
    fee_supplied = fee_amount_supplied or fee_category_supplied
    requested_fee_amount = update.pop("fee_amount", None)
    requested_fee_category = update.pop("fee_category_id", None)

    if update.get("is_planned"):
        ensure_family_plan(db, user_id)

    # Снимок до изменений (для журнала)
    prev_amount, prev_currency = tx.amount, tx.currency

    # Если меняется счёт — проверим, что он принадлежит пользователю
    if "account_id" in update and update["account_id"] is not None:
        acc = db.query(Account).filter(
            Account.id == update["account_id"], Account.user_id == user_id
        ).first()
        if not acc:
            raise HTTPException(status_code=404, detail="Account not found")

    # То же для категории — иначе можно привязаться к чужой категории
    if "category_id" in update and update["category_id"] is not None:
        _ensure_own_category(db, user_id, update["category_id"])

    # Откатываем эффект старого состояния полностью (обе стороны для перевода)
    _apply_tx_effect(db, tx, reverse=True)

    # Нормализуем входящие значения
    if "type" in update:
        try:
            update["type"] = TransactionType[update["type"]]
        except KeyError:
            raise HTTPException(status_code=400, detail=f"Invalid type: {update['type']}")
    if "currency" in update and update["currency"]:
        update["currency"] = update["currency"].upper()

    for k, v in update.items():
        setattr(tx, k, v)

    # Пересчитываем поля перевода / очищаем их для дохода-расхода
    if tx.type == TransactionType.transfer:
        tx.category_id = None
        # Если сумму зачисления передали явно — берём её, иначе пересчитываем по курсу
        explicit_to_amount = update["to_amount"] if "to_amount" in update else None
        tx.to_account_id, tx.to_currency, tx.to_amount = _resolve_transfer_dest(
            db, user_id, tx.currency, tx.amount,
            tx.to_account_id, tx.to_currency, explicit_to_amount,
        )
    else:
        tx.to_account_id = tx.to_amount = tx.to_currency = None

    tx.family_id, tx.is_family_expense, tx.reimbursement_amount = _family_fields(
        db,
        user_id,
        tx.type,
        tx.amount,
        bool(tx.is_family_expense),
        tx.reimbursement_amount,
    )
    exchange_svc.snapshot_transaction_rates(
        db, user_id, tx, force=refresh_rate_snapshot
    )

    # Применяем новый эффект
    _apply_tx_effect(db, tx, reverse=False)

    if tx.type == TransactionType.transfer:
        existing_fee = db.query(Transaction).filter(
            Transaction.linked_transfer_id == tx.id,
            Transaction.user_id == user_id,
        ).first()
        _sync_transfer_fee(
            db,
            tx,
            fee_amount=requested_fee_amount if fee_amount_supplied else (existing_fee.amount if existing_fee else None),
            fee_category_id=requested_fee_category if fee_category_supplied else (existing_fee.category_id if existing_fee else None),
        )
    else:
        # A transfer changed into an income/expense must not leave its fee in
        # the balance as a separate orphan operation.
        linked_fees = db.query(Transaction).filter(
            Transaction.linked_transfer_id == tx.id,
            Transaction.user_id == user_id,
        ).all()
        for fee in linked_fees:
            _apply_tx_effect(db, fee, reverse=True)
            _write_history(db, user_id, fee, "deleted")
            db.delete(fee)
        tx.fee_amount = None
        tx.fee_category_id = None

    db.flush()
    _write_history(db, user_id, tx, "edited", prev_amount=prev_amount, prev_currency=prev_currency)
    db.commit()
    db.refresh(tx)
    return tx


@router.delete("/{transaction_id}", status_code=204)
def delete_transaction(
    transaction_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    tx = db.query(Transaction).filter(
        Transaction.id == transaction_id, Transaction.user_id == user_id
    ).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    linked_fees = db.query(Transaction).filter(
        Transaction.linked_transfer_id == tx.id,
        Transaction.user_id == user_id,
    ).all()
    for fee in linked_fees:
        _apply_tx_effect(db, fee, reverse=True)
        _write_history(db, user_id, fee, "deleted")
        db.delete(fee)
    _apply_tx_effect(db, tx, reverse=True)
    _write_history(db, user_id, tx, "deleted")
    db.delete(tx)
    db.commit()
