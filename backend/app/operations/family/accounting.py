"""Family: accounting. Callers supply resolved user and database session."""
from datetime import datetime, timezone
from typing import Optional
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.models.account import Account
from app.models.category import Category
from app.models.family import FamilyCategoryMapping, FamilyExpenseAccounting
from app.models.transaction import Transaction, TransactionType
from app.models.user import User
from app.services.notifications import notify_family_members
from app.services import exchange as exchange_svc
from app.services.family_context import accounting_rows_query, _filter_month, require_family_owner, _user_label
from app.schemas.family_views import FamilyExpenseAccept, FamilyExpenseAcceptBatch, FamilyExpenseAcceptBatchItem


def pending_family_expense_accounting(year: Optional[int]=None, month: Optional[int]=None, db: Session=None, user_id: int=None):
    membership = require_family_owner(db, user_id)
    rows = accounting_rows_query(db, membership.family_id).filter(
        FamilyExpenseAccounting.owner_user_id == user_id,
        FamilyExpenseAccounting.status == "pending",
    ).order_by(FamilyExpenseAccounting.created_at.asc()).all()
    tx_ids = [item.source_transaction_id for item in rows]
    transactions = {
        item.id: item for item in _filter_month(db.query(Transaction).filter(Transaction.id.in_(tx_ids)), year, month).all()
    } if tx_ids else {}
    user_ids = {item.source_user_id for item in rows}
    users = {
        item.id: item for item in db.query(User).filter(User.id.in_(user_ids)).all()
    } if user_ids else {}
    source_category_ids = {item.source_category_id for item in rows if item.source_category_id}
    source_categories = dict(db.query(Category.id, Category.name).filter(Category.id.in_(source_category_ids)).all()) if source_category_ids else {}
    owner_categories = db.query(Category).filter(
        Category.user_id == user_id,
        Category.type == "expense",
    ).order_by(Category.sort_order, Category.name).all()
    owner_accounts = db.query(Account).filter(
        Account.user_id == user_id,
        Account.show_for_entries.is_(True),
    ).order_by(Account.sort_order, Account.name).all()
    mappings = {
        (item.source_user_id, item.source_category_id): item.owner_category_id
        for item in db.query(FamilyCategoryMapping).filter(
            FamilyCategoryMapping.family_id == membership.family_id,
            FamilyCategoryMapping.owner_user_id == user_id,
        ).all()
    }
    return {
        "items": [
            {
                "id": item.id,
                "transaction_id": tx.id,
                "amount": tx.amount,
                "currency": tx.currency,
                "description": tx.description,
                "date": tx.date,
                "source_user_id": item.source_user_id,
                "source_name": _user_label(users.get(item.source_user_id), ""),
                "source_category_id": item.source_category_id,
                "source_category_name": source_categories.get(item.source_category_id, "Без категории"),
                "suggested_owner_category_id": mappings.get((item.source_user_id, item.source_category_id)),
                "reimbursement_amount": tx.reimbursement_amount,
            }
            for item in rows if (tx := transactions.get(item.source_transaction_id))
        ],
        "categories": [
            {"id": category.id, "name": category.name, "parent_id": category.parent_id}
            for category in owner_categories
        ],
        "accounts": [
            {"id": account.id, "name": account.name}
            for account in owner_accounts
        ],
    }


def accept_family_expense_accounting(accounting_id: int, data: FamilyExpenseAccept, db: Session=None, user_id: int=None):
    return accept_family_expense_accounting_batch(
        FamilyExpenseAcceptBatch(items=[FamilyExpenseAcceptBatchItem(
            id=accounting_id, owner_category_id=data.owner_category_id, owner_account_id=data.owner_account_id,
        )]), db, user_id,
    )


def accept_family_expense_accounting_batch(data: FamilyExpenseAcceptBatch, db: Session=None, user_id: int=None):
    """Create actual owner expenses for the selected common purchases in one commit."""
    membership = require_family_owner(db, user_id)
    requested_ids = [entry.id for entry in data.items]
    if len(set(requested_ids)) != len(requested_ids):
        raise HTTPException(status_code=400, detail="Одна покупка указана дважды")
    rows = accounting_rows_query(db, membership.family_id).filter(
        FamilyExpenseAccounting.id.in_(requested_ids),
        FamilyExpenseAccounting.owner_user_id == user_id,
        FamilyExpenseAccounting.status == "pending",
    ).order_by(FamilyExpenseAccounting.id).with_for_update().all()
    if len(rows) != len(requested_ids):
        raise HTTPException(status_code=409, detail="Часть покупок уже учтена или недоступна")
    rows_by_id = {item.id: item for item in rows}
    category_ids = {entry.owner_category_id for entry in data.items}
    categories = {
        category.id: category for category in db.query(Category).filter(
            Category.id.in_(category_ids),
            Category.user_id == user_id,
            Category.type == "expense",
        ).all()
    }
    account_ids = {entry.owner_account_id for entry in data.items}
    accounts = {
        account.id: account for account in db.query(Account).filter(
            Account.id.in_(account_ids),
            Account.user_id == user_id,
            Account.show_for_entries.is_(True),
        ).all()
    }
    if len(categories) != len(category_ids):
        raise HTTPException(status_code=400, detail="Выберите свои расходные категории")
    if len(accounts) != len(account_ids):
        raise HTTPException(status_code=400, detail="Выберите свои счета для всех покупок")
    source_ids = [item.source_transaction_id for item in rows]
    db.query(Account.id).filter(Account.id.in_(account_ids)).order_by(Account.id).with_for_update().all()
    sources = {
        tx.id: tx for tx in db.query(Transaction).filter(Transaction.id.in_(source_ids)).with_for_update().all()
    }
    if len(sources) != len(source_ids):
        raise HTTPException(status_code=409, detail="Не найдена исходная семейная покупка")

    # The validation above happens before any balance changes, so the whole
    # batch is accepted or rejected as one operation.
    from app.services.ledger import apply_transaction_effect, write_transaction_history
    recipients: set[int] = set()
    created_ids: list[int] = []
    now = datetime.now(timezone.utc)
    for entry in data.items:
        item = rows_by_id[entry.id]
        source = sources[item.source_transaction_id]
        owner_tx = Transaction(
            amount=source.amount,
            currency=source.currency,
            type=TransactionType.expense,
            description=source.description or "Семейная покупка",
            date=source.date,
            account_id=accounts[entry.owner_account_id].id,
            category_id=categories[entry.owner_category_id].id,
            user_id=user_id,
            # This is the owner's ordinary expense. The source entry remains
            # the only family entry, therefore the family report does not
            # double-count it.
            is_family_expense=False,
            reimbursement_amount=0,
        )
        db.add(owner_tx)
        db.flush()
        exchange_svc.snapshot_transaction_rates(db, user_id, owner_tx)
        apply_transaction_effect(db, owner_tx)
        write_transaction_history(db, user_id, owner_tx, "created")
        item.owner_category_id = owner_tx.category_id
        item.owner_account_id = owner_tx.account_id
        item.owner_transaction_id = owner_tx.id
        item.status = "accepted"
        item.accepted_at = now
        created_ids.append(owner_tx.id)
        recipients.add(item.source_user_id)
        if item.source_category_id:
            mapping = db.query(FamilyCategoryMapping).filter(
                FamilyCategoryMapping.family_id == membership.family_id,
                FamilyCategoryMapping.source_user_id == item.source_user_id,
                FamilyCategoryMapping.source_category_id == item.source_category_id,
                FamilyCategoryMapping.owner_user_id == user_id,
            ).first()
            if mapping:
                mapping.owner_category_id = owner_tx.category_id
            else:
                db.add(FamilyCategoryMapping(
                    family_id=membership.family_id,
                    source_user_id=item.source_user_id,
                    source_category_id=item.source_category_id,
                    owner_user_id=user_id,
                    owner_category_id=owner_tx.category_id,
                ))
    notify_family_members(
        db,
        family_id=membership.family_id,
        actor_user_id=user_id,
        recipient_ids=recipients,
        event="family_expense_accounted",
        title="Общие покупки учтены",
        message="Владелец семьи перенёс общие покупки в свой учёт.",
        link="/settings/family",
    )
    db.commit()
    return {"accepted": len(created_ids), "transaction_ids": created_ids}
