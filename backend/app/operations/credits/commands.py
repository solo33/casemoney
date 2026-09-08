"""Credits: commands. Callers supply resolved user and database session."""
from datetime import date, datetime, time, timezone
from app.application import ApplicationError
from sqlalchemy.orm import Session
from app.services.ledger import apply_transaction_effect, write_transaction_history
from app.models.credit import CreditObligation, CreditPayment
from app.models.transaction import Transaction, TransactionType
from app.schemas.credit import CreditCreate, CreditPaymentCreate, CreditUpdate
from app.services.exchange import snapshot_transaction_rates
from app.operations.credits.common import _advance_month, _annuity_payment, _calculate_deposit_income, _calculate_mortgage_split, _delete_planned_interest, _estimate_remaining_months, _initial_payment_date, _monthly_rate, _own_account, _own_category, _serialize, _sync_planned_interest, _validate_cashflow_category


def create_credit(data: CreditCreate, db: Session=None, user_id: int=None):
    _own_account(db, user_id, data.source_account_id)
    _own_account(db, user_id, data.linked_account_id)
    funds_account = _own_account(db, user_id, data.funds_account_id)
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
        early_repayment_mode=data.early_repayment_mode,
        interest_payout_frequency=data.interest_payout_frequency,
        capitalization=data.capitalization,
        interest_accrual_mode=data.interest_accrual_mode,
        opened_at=data.opened_at,
        due_day=data.due_day,
        statement_day=data.statement_day,
        next_payment_date=data.next_payment_date or _initial_payment_date(data.due_day),
        end_date=data.end_date,
        reminder_days_before=data.reminder_days_before,
        source_account_id=data.source_account_id,
        linked_account_id=data.linked_account_id,
        funds_received=data.funds_received,
        funds_account_id=data.funds_account_id,
        category_id=data.category_id,
        notes=data.notes,
    )
    if credit.kind == "deposit":
        credit.interest_payout_frequency = credit.interest_payout_frequency or "monthly"
        credit.monthly_payment = _calculate_deposit_income(credit)
    db.add(credit)
    db.flush()
    if data.funds_received:
        amount = float(data.original_amount or data.current_balance or 0)
        transaction = Transaction(
            amount=amount,
            currency=credit.currency,
            type=TransactionType.income,
            description=f"Получение кредита: {credit.name}",
            date=datetime.combine(data.opened_at or date.today(), time.min, tzinfo=timezone.utc),
            account_id=funds_account.id,
            user_id=user_id,
            is_financing=True,
        )
        db.add(transaction)
        db.flush()
        apply_transaction_effect(db, transaction)
        write_transaction_history(db, user_id, transaction, "created")
        credit.funding_transaction_id = transaction.id
    _sync_planned_interest(db, credit)
    db.commit()
    db.refresh(credit)
    return _serialize(db, credit)


def update_credit(credit_id: int, data: CreditUpdate, db: Session=None, user_id: int=None):
    credit = db.query(CreditObligation).filter(
        CreditObligation.id == credit_id,
        CreditObligation.user_id == user_id,
    ).first()
    if not credit:
        raise ApplicationError(status_code=404, detail="Кредит или долг не найден")
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
        _sync_planned_interest(db, credit)
    db.commit()
    db.refresh(credit)
    return _serialize(db, credit)


def delete_credit(credit_id: int, db: Session=None, user_id: int=None):
    """Delete an obligation together with the ledger entries created for it.

    Credit payments are not standalone operations: deleting only their records
    would leave expenses/income in account balances.  Revert and remove every
    linked transaction in the same database transaction instead.
    """
    credit = db.query(CreditObligation).filter(
        CreditObligation.id == credit_id,
        CreditObligation.user_id == user_id,
    ).first()
    if not credit:
        raise ApplicationError(status_code=404, detail="Кредит или долг не найден")

    transaction_ids = [
        payment.transaction_id
        for payment in credit.payments
        if payment.transaction_id is not None
    ]
    if credit.funding_transaction_id is not None:
        transaction_ids.append(credit.funding_transaction_id)
    if credit.planned_interest_transaction_id is not None:
        transaction_ids.append(credit.planned_interest_transaction_id)

    for transaction_id in set(transaction_ids):
        transaction = db.query(Transaction).filter(
            Transaction.id == transaction_id,
            Transaction.user_id == user_id,
        ).first()
        if transaction:
            if not transaction.is_planned:
                apply_transaction_effect(db, transaction, reverse=True)
                write_transaction_history(db, user_id, transaction, "deleted")
            db.delete(transaction)

    db.delete(credit)
    db.commit()


def register_payment(credit_id: int, data: CreditPaymentCreate, db: Session=None, user_id: int=None):
    credit = db.query(CreditObligation).filter(
        CreditObligation.id == credit_id,
        CreditObligation.user_id == user_id,
        CreditObligation.status == "active",
    ).first()
    if not credit:
        raise ApplicationError(status_code=404, detail="Активное обязательство или депозит не найден")
    account = _own_account(db, user_id, data.account_id)
    linked = _own_account(db, user_id, credit.linked_account_id)
    paid_at = data.paid_at or datetime.now(timezone.utc)

    # Replace the forecast with the actual receipt. This happens before the
    # real transaction is inserted, so a failure cannot leave two entries.
    if credit.kind == "deposit":
        _delete_planned_interest(db, credit)

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
            raise ApplicationError(status_code=400, detail="Выберите другой счёт для погашения кредитной карты")
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
            else "Досрочное погашение"
            if data.is_early_payment
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
    apply_transaction_effect(db, transaction)
    snapshot_transaction_rates(db, user_id, transaction)
    write_transaction_history(db, user_id, transaction, "created")

    if data.is_early_payment:
        if credit.kind not in {"mortgage", "loan", "private_debt"} or credit.direction != "owe":
            raise ApplicationError(status_code=400, detail="Досрочное погашение доступно только для вашего кредита или займа")
        principal_amount = min(float(data.amount), max(0.0, float(credit.current_balance or 0)))
        interest_amount = 0.0
        mode = data.early_repayment_mode or credit.early_repayment_mode
        if credit.kind == "mortgage":
            old_balance = max(0.0, float(credit.current_balance or 0))
            old_payment = float(credit.monthly_payment or 0)
            rate = _monthly_rate(credit)
            if mode == "reduce_payment" and old_payment > 0:
                months = _estimate_remaining_months(old_balance, old_payment, rate)
                if months is not None:
                    new_payment = _annuity_payment(max(0.0, old_balance - principal_amount), months, rate)
                    if new_payment is not None:
                        credit.monthly_payment = new_payment
            credit.early_repayment_mode = mode
    else:
        principal_amount, interest_amount = _calculate_mortgage_split(credit, data.amount)

    # Доход по депозиту не уменьшает его тело. Для займа возврат, напротив,
    # сокращает остаток задолженности. У ипотеки остаток сокращает только
    # погашение тела, а не вся сумма ежемесячного платежа.
    if credit.kind == "deposit" and credit.capitalization and credit.current_balance is not None:
        credit.current_balance = round(credit.current_balance + data.amount, 2)
    elif credit.kind != "deposit" and credit.current_balance is not None:
        balance_reduction = principal_amount if principal_amount is not None else data.amount
        credit.current_balance = max(0.0, round(credit.current_balance - balance_reduction, 2))
    payment = CreditPayment(
        credit_id=credit.id,
        user_id=user_id,
        transaction_id=transaction.id,
        amount=data.amount,
        principal_amount=principal_amount,
        interest_amount=interest_amount,
        is_early_payment=data.is_early_payment,
        early_repayment_mode=(data.early_repayment_mode or credit.early_repayment_mode) if data.is_early_payment else None,
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
        _sync_planned_interest(db, credit)
    if credit.kind not in {"credit_card", "deposit"} and credit.current_balance is not None and credit.current_balance <= 0.005:
        credit.status = "closed"
    db.commit()
    db.refresh(payment)
    return payment
