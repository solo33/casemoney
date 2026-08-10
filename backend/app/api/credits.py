import calendar
from datetime import date, datetime, time, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.api.transactions import _apply_tx_effect, _write_history
from app.database import get_db
from app.models.account import Account
from app.models.category import Category
from app.models.credit import CreditObligation, CreditPayment
from app.models.transaction import Transaction, TransactionType
from app.schemas.credit import (
    CreditCreate,
    CreditPaymentCreate,
    CreditPaymentResponse,
    CreditResponse,
    CreditSummary,
    CreditUpdate,
)
from app.services.auth import decode_token
from app.services.plans import ensure_family_plan
from app.services.credit_reminders import process_credit_reminders


router = APIRouter(prefix="/api/credits", tags=["credits"])
security = HTTPBearer()


def current_user_id(credentials: HTTPAuthorizationCredentials = Depends(security)) -> int:
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    return int(payload["sub"])


def require_family(
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
) -> int:
    ensure_family_plan(db, user_id)
    return user_id


def _own_account(db: Session, user_id: int, account_id: Optional[int]) -> Optional[Account]:
    if account_id is None:
        return None
    account = db.query(Account).filter(Account.id == account_id, Account.user_id == user_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Счёт не найден")
    return account


def _own_category(db: Session, user_id: int, category_id: Optional[int]) -> Optional[Category]:
    if category_id is None:
        return None
    category = db.query(Category).filter(Category.id == category_id, Category.user_id == user_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Категория не найдена")
    return category


def _validate_cashflow_category(category: Optional[Category], kind: str) -> None:
    if category is None:
        return
    expected = "income" if kind == "deposit" else "expense"
    if category.type != expected:
        label = "дохода" if expected == "income" else "расхода"
        raise HTTPException(status_code=400, detail=f"Выберите категорию {label}")


def _initial_payment_date(due_day: Optional[int]) -> Optional[date]:
    if due_day is None:
        return None
    today = date.today()
    day = min(due_day, calendar.monthrange(today.year, today.month)[1])
    candidate = date(today.year, today.month, day)
    if candidate >= today:
        return candidate
    year = today.year + (1 if today.month == 12 else 0)
    month = 1 if today.month == 12 else today.month + 1
    return date(year, month, min(due_day, calendar.monthrange(year, month)[1]))


def _advance_month(current: date, due_day: Optional[int]) -> date:
    year = current.year + (1 if current.month == 12 else 0)
    month = 1 if current.month == 12 else current.month + 1
    wanted_day = due_day or current.day
    return date(year, month, min(wanted_day, calendar.monthrange(year, month)[1]))


def _calculate_deposit_income(credit: CreditObligation) -> Optional[float]:
    """Calculate the next expected interest payment without touching the ledger."""
    if credit.kind != "deposit" or credit.annual_interest_rate is None:
        return credit.monthly_payment
    principal = float(credit.current_balance or credit.original_amount or 0)
    rate = float(credit.annual_interest_rate) / 100
    if credit.interest_payout_frequency == "maturity":
        start = credit.opened_at or date.today()
        finish = credit.end_date or credit.next_payment_date or start
        days = max(1, (finish - start).days)
        return round(principal * rate * days / 365, 2)
    return round(principal * rate / 12, 2)


def _serialize(db: Session, credit: CreditObligation, with_payments: bool = True) -> CreditResponse:
    source = _own_account(db, credit.user_id, credit.source_account_id)
    linked = _own_account(db, credit.user_id, credit.linked_account_id)
    category = _own_category(db, credit.user_id, credit.category_id)
    current_balance = credit.current_balance
    if credit.kind == "credit_card" and linked:
        currency_balance = next((item.balance for item in linked.balances if item.currency == credit.currency), None)
        if currency_balance is not None:
            current_balance = max(0.0, round(-currency_balance, 2))
    days = (credit.next_payment_date - date.today()).days if credit.next_payment_date else None
    payments = (
        db.query(CreditPayment)
        .filter(CreditPayment.credit_id == credit.id)
        .order_by(CreditPayment.paid_at.desc(), CreditPayment.id.desc())
        .limit(50)
        .all()
        if with_payments else []
    )
    return CreditResponse(
        id=credit.id,
        name=credit.name,
        kind=credit.kind,
        direction=credit.direction,
        currency=credit.currency,
        counterparty=credit.counterparty,
        original_amount=credit.original_amount,
        current_balance=current_balance,
        credit_limit=credit.credit_limit,
        monthly_payment=credit.monthly_payment,
        annual_interest_rate=credit.annual_interest_rate,
        interest_payout_frequency=credit.interest_payout_frequency,
        capitalization=credit.capitalization,
        opened_at=credit.opened_at,
        due_day=credit.due_day,
        statement_day=credit.statement_day,
        next_payment_date=credit.next_payment_date,
        end_date=credit.end_date,
        reminder_days_before=credit.reminder_days_before,
        source_account_id=credit.source_account_id,
        source_account_name=source.name if source else None,
        linked_account_id=credit.linked_account_id,
        linked_account_name=linked.name if linked else None,
        category_id=credit.category_id,
        category_name=category.name if category else None,
        status=credit.status,
        notes=credit.notes,
        days_until_payment=days,
        is_overdue=days is not None and days < 0,
        payments=[CreditPaymentResponse.model_validate(item) for item in payments],
    )


@router.get("/", response_model=list[CreditResponse])
def list_credits(
    db: Session = Depends(get_db),
    user_id: int = Depends(require_family),
):
    credits = (
        db.query(CreditObligation)
        .filter(CreditObligation.user_id == user_id)
        .order_by(CreditObligation.status, CreditObligation.next_payment_date, CreditObligation.id)
        .all()
    )
    process_credit_reminders(db, user_id=user_id)
    return [_serialize(db, item) for item in credits]


@router.get("/summary", response_model=CreditSummary)
def credit_summary(
    db: Session = Depends(get_db),
    user_id: int = Depends(require_family),
):
    credits = db.query(CreditObligation).filter(
        CreditObligation.user_id == user_id,
        CreditObligation.status == "active",
    ).order_by(CreditObligation.next_payment_date, CreditObligation.id).all()
    process_credit_reminders(db, user_id=user_id)
    serialized = [_serialize(db, item, with_payments=False) for item in credits]
    return CreditSummary(
        total_active=len(serialized),
        overdue_count=sum(1 for item in serialized if item.is_overdue),
        upcoming=[item for item in serialized if item.next_payment_date][:5],
    )


@router.post("/", response_model=CreditResponse, status_code=201)
def create_credit(
    data: CreditCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(require_family),
):
    _own_account(db, user_id, data.source_account_id)
    _own_account(db, user_id, data.linked_account_id)
    category = _own_category(db, user_id, data.category_id)
    _validate_cashflow_category(category, data.kind)
    credit = CreditObligation(
        user_id=user_id,
        name=data.name.strip(),
        kind=data.kind,
        direction=data.direction,
        currency=data.currency.upper(),
        counterparty=data.counterparty,
        original_amount=data.original_amount,
        current_balance=data.current_balance,
        credit_limit=data.credit_limit,
        monthly_payment=data.monthly_payment,
        annual_interest_rate=data.annual_interest_rate,
        interest_payout_frequency=data.interest_payout_frequency,
        capitalization=data.capitalization,
        opened_at=data.opened_at,
        due_day=data.due_day,
        statement_day=data.statement_day,
        next_payment_date=data.next_payment_date or _initial_payment_date(data.due_day),
        end_date=data.end_date,
        reminder_days_before=data.reminder_days_before,
        source_account_id=data.source_account_id,
        linked_account_id=data.linked_account_id,
        category_id=data.category_id,
        notes=data.notes,
    )
    if credit.kind == "deposit":
        credit.interest_payout_frequency = credit.interest_payout_frequency or "monthly"
        credit.monthly_payment = _calculate_deposit_income(credit)
    db.add(credit)
    db.commit()
    db.refresh(credit)
    return _serialize(db, credit)


@router.patch("/{credit_id}", response_model=CreditResponse)
def update_credit(
    credit_id: int,
    data: CreditUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(require_family),
):
    credit = db.query(CreditObligation).filter(
        CreditObligation.id == credit_id,
        CreditObligation.user_id == user_id,
    ).first()
    if not credit:
        raise HTTPException(status_code=404, detail="Кредит или долг не найден")
    update = data.model_dump(exclude_unset=True)
    if "source_account_id" in update:
        _own_account(db, user_id, update["source_account_id"])
    if "linked_account_id" in update:
        _own_account(db, user_id, update["linked_account_id"])
    if "category_id" in update:
        category = _own_category(db, user_id, update["category_id"])
        _validate_cashflow_category(category, credit.kind)
    for key, value in update.items():
        setattr(credit, key, value)
    if credit.kind == "deposit":
        credit.interest_payout_frequency = credit.interest_payout_frequency or "monthly"
        credit.monthly_payment = _calculate_deposit_income(credit)
    db.commit()
    db.refresh(credit)
    return _serialize(db, credit)


@router.post("/{credit_id}/payments", response_model=CreditPaymentResponse, status_code=201)
def register_payment(
    credit_id: int,
    data: CreditPaymentCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(require_family),
):
    credit = db.query(CreditObligation).filter(
        CreditObligation.id == credit_id,
        CreditObligation.user_id == user_id,
        CreditObligation.status == "active",
    ).first()
    if not credit:
        raise HTTPException(status_code=404, detail="Активное обязательство или депозит не найден")
    account = _own_account(db, user_id, data.account_id)
    linked = _own_account(db, user_id, credit.linked_account_id)
    paid_at = data.paid_at or datetime.now(timezone.utc)

    if credit.kind == "deposit":
        tx_type = TransactionType.income
        to_account_id = None
        to_amount = None
        to_currency = None
    elif credit.direction == "receivable":
        tx_type = TransactionType.income
        to_account_id = None
        to_amount = None
        to_currency = None
    elif credit.kind == "credit_card":
        if not linked or linked.id == account.id:
            raise HTTPException(status_code=400, detail="Выберите другой счёт для погашения кредитной карты")
        tx_type = TransactionType.transfer
        to_account_id = linked.id
        to_amount = data.amount
        to_currency = credit.currency
    else:
        tx_type = TransactionType.expense
        to_account_id = None
        to_amount = None
        to_currency = None

    transaction = Transaction(
        amount=data.amount,
        currency=credit.currency,
        type=tx_type,
        description=(
            "Доход по депозиту"
            if credit.kind == "deposit"
            else "Возврат долга"
            if credit.direction == "receivable"
            else "Платёж"
        ) + f": {credit.name}",
        date=paid_at,
        account_id=account.id,
        category_id=credit.category_id if tx_type != TransactionType.transfer else None,
        user_id=user_id,
        to_account_id=to_account_id,
        to_amount=to_amount,
        to_currency=to_currency,
    )
    db.add(transaction)
    db.flush()
    _apply_tx_effect(db, transaction)
    _write_history(db, user_id, transaction, "created")

    # Доход по депозиту не уменьшает его тело. Для займа возврат, напротив,
    # сокращает остаток задолженности.
    if credit.kind == "deposit" and credit.capitalization and credit.current_balance is not None:
        credit.current_balance = round(credit.current_balance + data.amount, 2)
    elif credit.kind != "deposit" and credit.current_balance is not None:
        credit.current_balance = max(0.0, round(credit.current_balance - data.amount, 2))
    payment = CreditPayment(
        credit_id=credit.id,
        user_id=user_id,
        transaction_id=transaction.id,
        amount=data.amount,
        currency=credit.currency,
        paid_at=paid_at,
        account_id=account.id,
        balance_after=credit.current_balance,
        notes=data.notes,
    )
    db.add(payment)
    payment_day = paid_at.date()
    if credit.kind == "deposit" and credit.interest_payout_frequency == "maturity":
        credit.status = "closed"
        credit.next_payment_date = None
    elif credit.next_payment_date:
        while credit.next_payment_date <= payment_day:
            credit.next_payment_date = _advance_month(credit.next_payment_date, credit.due_day)
        credit.last_reminder_for_date = None
        credit.last_email_reminder_for_date = None
    if credit.kind == "deposit":
        credit.monthly_payment = _calculate_deposit_income(credit)
    if credit.kind not in {"credit_card", "deposit"} and credit.current_balance is not None and credit.current_balance <= 0.005:
        credit.status = "closed"
    db.commit()
    db.refresh(payment)
    return payment
