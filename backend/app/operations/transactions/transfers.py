"""Transactions: transfers. Callers supply resolved user and database session."""
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.models.transaction import Transaction, TransactionType
from app.models.account import Account
from app.schemas.transaction import TransferSuggestion, TransferMatchConfirm
from app.services.ledger import apply_transaction_effect, write_transaction_history
from app.services import exchange as exchange_svc
from app.operations.transactions.common import _ensure_expense_category, _sync_transfer_fee, _transfer_pair_confidence


def transfer_suggestions(db: Session=None, user_id: int=None):
    """Find likely two-sided own-account transfers for a user to review."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=365)
    rows = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            Transaction.type.in_([TransactionType.expense, TransactionType.income]),
            Transaction.is_planned.is_(False),
            Transaction.linked_transfer_id.is_(None),
            Transaction.date >= cutoff,
        )
        .order_by(Transaction.date.desc(), Transaction.id.desc())
        .limit(1200)
        .all()
    )
    expenses = [item for item in rows if item.type == TransactionType.expense]
    incomes = [item for item in rows if item.type == TransactionType.income]
    account_ids = {item.account_id for item in rows}
    accounts = {
        account.id: account.name
        for account in db.query(Account).filter(Account.id.in_(account_ids)).all()
    } if account_ids else {}
    used_income_ids: set[int] = set()
    result: list[TransferSuggestion] = []
    for expense in expenses:
        candidates = []
        for income in incomes:
            if income.id in used_income_ids:
                continue
            score = _transfer_pair_confidence(expense, income)
            if score:
                candidates.append((score, income))
        if not candidates:
            continue
        (confidence, fee_amount), income = max(candidates, key=lambda item: item[0][0])
        used_income_ids.add(income.id)
        result.append(TransferSuggestion(
            expense_id=expense.id,
            income_id=income.id,
            date=expense.date,
            income_date=income.date,
            account_id=expense.account_id,
            account_name=accounts.get(expense.account_id, "Счёт"),
            to_account_id=income.account_id,
            to_account_name=accounts.get(income.account_id, "Счёт"),
            amount=expense.amount,
            currency=expense.currency,
            to_amount=income.amount,
            to_currency=income.currency,
            fee_amount=fee_amount,
            confidence=confidence,
        ))
    return sorted(result, key=lambda item: (item.date, item.expense_id), reverse=True)[:30]


def confirm_transfer_match(transaction_id: int, data: TransferMatchConfirm, db: Session=None, user_id: int=None):
    """Replace a confirmed expense/income pair with one transfer."""
    expense = db.query(Transaction).filter(
        Transaction.id == transaction_id,
        Transaction.user_id == user_id,
        Transaction.type == TransactionType.expense,
        Transaction.is_planned.is_(False),
    ).first()
    income = db.query(Transaction).filter(
        Transaction.id == data.income_transaction_id,
        Transaction.user_id == user_id,
        Transaction.type == TransactionType.income,
        Transaction.is_planned.is_(False),
    ).first()
    if not expense or not income:
        raise HTTPException(status_code=404, detail="Одна из операций уже недоступна для сопоставления.")
    pair = _transfer_pair_confidence(expense, income)
    if not pair:
        raise HTTPException(status_code=400, detail="Эти операции не похожи на перевод между своими счетами.")
    _, possible_fee = pair
    if data.fee_category_id is not None:
        if not possible_fee:
            raise HTTPException(status_code=400, detail="Комиссию можно указать только при разнице сумм в одной валюте.")
        _ensure_expense_category(db, user_id, data.fee_category_id)

    previous_amount, previous_currency = expense.amount, expense.currency
    apply_transaction_effect(db, expense, reverse=True)
    apply_transaction_effect(db, income, reverse=True)
    expense.type = TransactionType.transfer
    expense.category_id = None
    expense.to_account_id = income.account_id
    expense.to_currency = income.currency
    expense.to_amount = income.amount
    if data.fee_category_id is not None and possible_fee:
        # Source debit = credit on destination + separately reported fee.
        expense.amount = income.amount
    exchange_svc.snapshot_transaction_rates(db, user_id, expense, force=True)
    apply_transaction_effect(db, expense)
    db.flush()
    if data.fee_category_id is not None and possible_fee:
        _sync_transfer_fee(
            db, expense,
            fee_amount=possible_fee,
            fee_category_id=data.fee_category_id,
        )
    write_transaction_history(db, user_id, income, "deleted")
    db.delete(income)
    write_transaction_history(db, user_id, expense, "edited", prev_amount=previous_amount, prev_currency=previous_currency)
    db.commit()
    db.refresh(expense)
    return expense
