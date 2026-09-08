"""Credits: common. Callers supply resolved user and database session."""
import calendar
import math
from datetime import date, datetime, time, timezone
from typing import Optional
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.models.account import Account
from app.models.category import Category
from app.models.credit import CreditObligation, CreditPayment
from app.models.transaction import Transaction, TransactionType
from app.schemas.credit import CreditPaymentResponse, CreditResponse, MortgageScheduleItem



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


def _delete_planned_interest(db: Session, credit: CreditObligation) -> None:
    """Remove the generated forecast, never touching a real account balance."""
    transaction_id = credit.planned_interest_transaction_id
    credit.planned_interest_transaction_id = None
    if transaction_id is None:
        return
    transaction = db.query(Transaction).filter(
        Transaction.id == transaction_id,
        Transaction.user_id == credit.user_id,
        Transaction.is_planned.is_(True),
    ).first()
    if transaction:
        db.delete(transaction)


def _sync_planned_interest(db: Session, credit: CreditObligation) -> None:
    """Keep exactly one future interest-income draft for a deposit.

    The draft is an aid for a user's plan, not an accounting operation: it is
    not applied to account balances and is replaced by the next draft after a
    real interest payment is recorded.
    """
    can_plan = (
        credit.kind == "deposit"
        and credit.status == "active"
        and credit.interest_accrual_mode == "planned"
        and credit.next_payment_date is not None
        and credit.source_account_id is not None
        and credit.category_id is not None
        and float(credit.monthly_payment or 0) > 0
    )
    if not can_plan:
        _delete_planned_interest(db, credit)
        return

    transaction = None
    if credit.planned_interest_transaction_id is not None:
        transaction = db.query(Transaction).filter(
            Transaction.id == credit.planned_interest_transaction_id,
            Transaction.user_id == credit.user_id,
            Transaction.is_planned.is_(True),
        ).first()
    values = {
        "amount": float(credit.monthly_payment),
        "currency": credit.currency,
        "type": TransactionType.income,
        "description": f"Плановые проценты по депозиту: {credit.name}",
        "date": datetime.combine(credit.next_payment_date, time.min, tzinfo=timezone.utc),
        "account_id": credit.source_account_id,
        "category_id": credit.category_id,
        "is_planned": True,
    }
    if transaction is None:
        transaction = Transaction(user_id=credit.user_id, **values)
        db.add(transaction)
        db.flush()
        credit.planned_interest_transaction_id = transaction.id
    else:
        for key, value in values.items():
            setattr(transaction, key, value)


def _calculate_mortgage_split(credit: CreditObligation, amount: float) -> tuple[Optional[float], Optional[float]]:
    """Return the principal and interest portions of one mortgage payment.

    The person records one real payment.  Its interest portion is calculated
    from the remaining principal and the annual rate saved in the mortgage;
    only the rest reduces the debt.  When a rate has not been entered yet, the
    former simple behaviour is retained so an existing mortgage stays usable.
    """
    if credit.kind != "mortgage" or credit.annual_interest_rate is None:
        return None, None
    balance = max(0.0, float(credit.current_balance or 0))
    raw_interest = round(balance * float(credit.annual_interest_rate) / 1200, 2)
    interest_share = min(round(amount, 2), raw_interest)
    principal = min(balance, max(0.0, round(amount - interest_share, 2)))
    # An overpayment is still a payment, but it cannot reduce the principal
    # below zero. Keep the persisted split equal to the actual payment.
    interest = round(amount - principal, 2)
    return principal, interest


def _monthly_rate(credit: CreditObligation) -> float:
    return max(0.0, float(credit.annual_interest_rate or 0)) / 1200


def _estimate_remaining_months(balance: float, payment: float, monthly_rate: float) -> Optional[int]:
    """Return the number of equal monthly payments needed to close a mortgage."""
    if balance <= 0:
        return 0
    if payment <= 0 or payment <= balance * monthly_rate:
        return None
    if monthly_rate == 0:
        return max(1, math.ceil(balance / payment))
    return max(1, math.ceil(-math.log(1 - balance * monthly_rate / payment) / math.log(1 + monthly_rate)))


def _annuity_payment(balance: float, months: int, monthly_rate: float) -> Optional[float]:
    if balance <= 0:
        return 0.0
    if months <= 0:
        return None
    if monthly_rate == 0:
        return round(balance / months, 2)
    multiplier = (1 + monthly_rate) ** months
    return round(balance * monthly_rate * multiplier / (multiplier - 1), 2)


def _mortgage_schedule(credit: CreditObligation) -> list[MortgageScheduleItem]:
    if credit.kind != "mortgage":
        raise HTTPException(status_code=400, detail="График доступен только для ипотеки")
    balance = round(max(0.0, float(credit.current_balance or 0)), 2)
    payment = round(float(credit.monthly_payment or 0), 2)
    rate = _monthly_rate(credit)
    if payment <= 0:
        raise HTTPException(status_code=400, detail="Укажите регулярный платёж, чтобы построить график")
    if payment <= balance * rate and balance > 0:
        raise HTTPException(status_code=400, detail="Регулярный платёж не покрывает проценты по текущей ставке")

    payment_date = credit.next_payment_date or _initial_payment_date(credit.due_day) or date.today()
    items: list[MortgageScheduleItem] = []
    for _ in range(600):
        if balance <= 0.005:
            break
        interest = round(balance * rate, 2)
        actual_payment = min(payment, round(balance + interest, 2))
        principal = round(max(0.0, actual_payment - interest), 2)
        if principal <= 0:
            break
        balance = round(max(0.0, balance - principal), 2)
        items.append(MortgageScheduleItem(
            payment_date=payment_date,
            payment_amount=actual_payment,
            principal_amount=principal,
            interest_amount=round(actual_payment - principal, 2),
            balance_after=balance,
        ))
        payment_date = _advance_month(payment_date, credit.due_day)
    return items


def _serialize(db: Session, credit: CreditObligation, with_payments: bool = True) -> CreditResponse:
    source = _own_account(db, credit.user_id, credit.source_account_id)
    linked = _own_account(db, credit.user_id, credit.linked_account_id)
    funds_account = _own_account(db, credit.user_id, credit.funds_account_id)
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
        early_repayment_mode=credit.early_repayment_mode,
        interest_payout_frequency=credit.interest_payout_frequency,
        capitalization=credit.capitalization,
        interest_accrual_mode=credit.interest_accrual_mode,
        planned_interest_transaction_id=credit.planned_interest_transaction_id,
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
        funds_received=credit.funds_received,
        funds_account_id=credit.funds_account_id,
        funds_account_name=funds_account.name if funds_account else None,
        funding_transaction_id=credit.funding_transaction_id,
        category_id=credit.category_id,
        category_name=category.name if category else None,
        status=credit.status,
        notes=credit.notes,
        days_until_payment=days,
        is_overdue=days is not None and days < 0,
        payments=[CreditPaymentResponse.model_validate(item) for item in payments],
    )
