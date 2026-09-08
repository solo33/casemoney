"""Transactions: common. Callers supply resolved user and database session."""
import hashlib
import json
from app.application import ApplicationError
from sqlalchemy.orm import Session
from typing import Optional
from app.models.transaction import Transaction, TransactionType
from app.models.category import Category
from app.models.transaction_tag import Tag
from app.models.family import FamilyMember
from app.schemas.transaction import TransactionCreate
from app.services.ledger import apply_transaction_effect, write_transaction_history
from app.services import exchange as exchange_svc
from app.services import family_accounts as family_accounts_svc
from app.services.plans import ensure_family_plan



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
        raise ApplicationError(
            status_code=409,
            detail="Ключ повтора уже использован для другой операции.",
        )
    return transaction


def _ensure_own_category(db: Session, user_id: int, category_id: int) -> None:
    """Категория в транзакции должна принадлежать этому пользователю."""
    cat = db.query(Category).filter(
        Category.id == category_id, Category.user_id == user_id
    ).first()
    if not cat:
        raise ApplicationError(status_code=404, detail="Category not found")


def _ensure_expense_category(db: Session, user_id: int, category_id: int) -> None:
    category = db.query(Category).filter(
        Category.id == category_id, Category.user_id == user_id
    ).first()
    if not category or category.type != "expense":
        raise ApplicationError(status_code=400, detail="Для комиссии выберите категорию расхода")


def _resolve_tags(db: Session, user_id: int, tag_ids: list[int]) -> list[Tag]:
    """Return only the current user's explicitly selected personal tags."""
    ids = list(dict.fromkeys(tag_ids))
    if len(ids) > 20:
        raise ApplicationError(status_code=400, detail="Можно указать не более 20 меток")
    if not ids:
        return []
    tags = db.query(Tag).filter(Tag.user_id == user_id, Tag.id.in_(ids)).all()
    if len(tags) != len(ids):
        raise ApplicationError(status_code=400, detail="Одна или несколько меток недоступны")
    return tags


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
    ).all()
    fee = fees[0] if fees else None
    active = fee_amount is not None and float(fee_amount) > 0
    if active and not fee_category_id:
        raise ApplicationError(status_code=400, detail="Укажите категорию комиссии")
    if active:
        _ensure_expense_category(db, transfer.user_id, fee_category_id)
    transfer.fee_amount = round(float(fee_amount), 2) if active else None
    transfer.fee_category_id = fee_category_id if active else None
    if fee:
        apply_transaction_effect(db, fee, reverse=True)
        if not active:
            write_transaction_history(db, transfer.user_id, fee, "deleted")
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
        apply_transaction_effect(db, fee)
        write_transaction_history(db, transfer.user_id, fee, "edited")
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
        apply_transaction_effect(db, fee)
        write_transaction_history(db, transfer.user_id, fee, "created")


def _resolve_transfer_dest(db: Session, user_id: int, src_currency: str, src_amount: float,
                           to_account_id, to_currency, to_amount):
    """Готовит (to_account_id, to_currency, to_amount) для перевода.

    Валидирует счёт-получатель. Если сумма зачисления не задана — вычисляет:
    та же валюта → та же сумма; иначе конвертирует по курсу пользователя.
    """
    if not to_account_id:
        raise ApplicationError(status_code=400, detail="Для перевода укажите счёт-получатель")
    dst = family_accounts_svc.require_write_access(db, to_account_id, user_id)
    cur = (to_currency or src_currency).upper()
    if to_amount is None:
        if cur == src_currency.upper():
            to_amount = src_amount
        else:
            try:
                to_amount = exchange_svc.convert_for_user(db, user_id, src_amount, src_currency, cur)
            except exchange_svc.ExchangeError:
                raise ApplicationError(422, "Курс недоступен. Укажите фактическую сумму зачисления в валюте получателя")
    return to_account_id, cur, round(float(to_amount), 2)


def _transfer_pair_confidence(expense: Transaction, income: Transaction) -> tuple[float, Optional[float]] | None:
    """Return a conservative score for an imported expense/income pair."""
    if expense.account_id == income.account_id or expense.is_planned or income.is_planned:
        return None
    days = abs((expense.date.date() - income.date.date()).days)
    if days > 3:
        return None
    fee_amount = None
    if expense.currency == income.currency:
        larger = max(float(expense.amount), float(income.amount), 1.0)
        difference = abs(float(expense.amount) - float(income.amount))
        if difference > max(5.0, larger * 0.03):
            return None
        if expense.amount > income.amount:
            fee_amount = round(float(expense.amount) - float(income.amount), 2)
        amount_score = 1 - min(difference / larger, 0.12)
    else:
        if not expense.exchange_rate or not income.exchange_rate:
            return None
        expense_value = float(expense.amount) * float(expense.exchange_rate)
        income_value = float(income.amount) * float(income.exchange_rate)
        larger = max(expense_value, income_value, 1.0)
        difference = abs(expense_value - income_value)
        if difference > larger * 0.05:
            return None
        amount_score = 1 - difference / larger
    return round(0.65 * amount_score + 0.35 * (1 - days / 4), 2), fee_amount


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
    # The application-wide billing switch is the source of truth.  Before paid
    # launch Family is deliberately free, while after it this keeps the same
    # paid-owner access rule as every other Family endpoint.
    ensure_family_plan(db, user_id)
    if tx_type != TransactionType.expense:
        raise ApplicationError(
            status_code=400,
            detail="Семейной можно отметить только расходную операцию",
        )
    membership = db.query(FamilyMember).filter(
        FamilyMember.user_id == user_id,
        FamilyMember.status == "active",
    ).first()
    if not membership:
        raise ApplicationError(
            status_code=400,
            detail="Сначала создайте или примите семейное пространство",
        )
    reimbursable = amount if reimbursement_amount is None else reimbursement_amount
    if reimbursable < 0 or reimbursable > amount:
        raise ApplicationError(
            status_code=400,
            detail="Сумма к возмещению должна быть от 0 до суммы расхода",
        )
    return membership.family_id, True, float(reimbursable)
