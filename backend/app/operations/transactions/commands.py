"""Transactions: commands. Callers supply resolved user and database session."""
from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import Optional
from app.models.transaction import Transaction, TransactionType
from app.models.category import Category
from app.models.user import User
from app.schemas.transaction import TransactionCreate, TransactionUpdate, TransactionBulkCategoryUpdate, TransactionBulkUpdateResult
from app.services.family_accounting import sync_family_expense_accounting
from app.services.ledger import apply_transaction_effect, write_transaction_history
from app.services import accounts as accounts_svc
from app.services import exchange as exchange_svc
from app.services import family_accounts as family_accounts_svc
from app.services.plans import ensure_family_plan
from app.services.automation import matched_category_id
from app.services.notifications import notify_family_members
from app.operations.transactions.common import _ensure_own_category, _existing_idempotent_transaction, _family_fields, _request_hash, _resolve_tags, _resolve_transfer_dest, _sync_transfer_fee


def create_transaction(data: TransactionCreate, idempotency_key: Optional[str]=None, db: Session=None, user_id: int=None):
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

    account = family_accounts_svc.require_write_access(db, data.account_id, user_id)

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
    transaction.tags = _resolve_tags(db, user_id, data.tag_ids)
    db.add(transaction)
    exchange_svc.snapshot_transaction_rates(db, user_id, transaction)
    try:
        db.flush()
        sync_family_expense_accounting(db, transaction)
        apply_transaction_effect(db, transaction, reverse=False)
        write_transaction_history(db, user_id, transaction, "created")
        if transaction.is_family_expense and transaction.type == TransactionType.expense:
            actor = user or db.query(User).filter(User.id == user_id).first()
            actor_name = actor.username if actor and actor.username else "Участник семьи"
            notify_family_members(
                db,
                family_id=transaction.family_id,
                actor_user_id=user_id,
                event="family_expense",
                title="Новый общий расход",
                message=(
                    f"{actor_name} добавил(а) общий расход: "
                    f"{transaction.amount:.2f} {transaction.currency}."
                ),
                link="/settings/family",
            )
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


def bulk_update_category(data: TransactionBulkCategoryUpdate, db: Session=None, user_id: int=None):
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
        sync_family_expense_accounting(db, row)
        write_transaction_history(
            db, user_id, row, "edited",
            prev_amount=prev_amount, prev_currency=prev_currency,
        )
    db.commit()
    return TransactionBulkUpdateResult(updated=len(rows))


def update_transaction(transaction_id: int, data: TransactionUpdate, db: Session=None, user_id: int=None):
    """Редактирование транзакции. Балансы пересчитываются корректно:
    откат старого эффекта → применение нового."""
    tx = db.query(Transaction).filter(Transaction.id == transaction_id).with_for_update().first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    family_accounts_svc.require_write_access(db, tx.account_id, user_id)

    update = data.model_dump(exclude_unset=True)
    from app.services.linked_transactions import validate_edit
    validate_edit(db, tx, update)
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
    requested_tag_ids = update.pop("tag_ids", None)

    if update.get("is_planned"):
        ensure_family_plan(db, user_id)

    # Снимок до изменений (для журнала)
    prev_amount, prev_currency = tx.amount, tx.currency

    # Если меняется счёт — проверим, что он принадлежит пользователю
    if "account_id" in update and update["account_id"] is not None:
        family_accounts_svc.require_write_access(db, update["account_id"], user_id)

    # То же для категории — иначе можно привязаться к чужой категории
    if "category_id" in update and update["category_id"] is not None:
        _ensure_own_category(db, user_id, update["category_id"])

    # Откатываем эффект старого состояния полностью (обе стороны для перевода)
    apply_transaction_effect(db, tx, reverse=True)

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

    if requested_tag_ids is not None:
        tx.tags = _resolve_tags(db, user_id, requested_tag_ids)

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
    apply_transaction_effect(db, tx, reverse=False)

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
            apply_transaction_effect(db, fee, reverse=True)
            write_transaction_history(db, user_id, fee, "deleted")
            db.delete(fee)
        tx.fee_amount = None
        tx.fee_category_id = None

    db.flush()
    sync_family_expense_accounting(db, tx)
    write_transaction_history(db, user_id, tx, "edited", prev_amount=prev_amount, prev_currency=prev_currency)
    db.commit()
    db.refresh(tx)
    return tx


def delete_transaction(transaction_id: int, db: Session=None, user_id: int=None):
    tx = db.query(Transaction).filter(Transaction.id == transaction_id).with_for_update().first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    family_accounts_svc.require_write_access(db, tx.account_id, user_id)
    from app.services.linked_transactions import before_delete
    before_delete(db, tx)

    linked_fees = db.query(Transaction).filter(
        Transaction.linked_transfer_id == tx.id,
        Transaction.user_id == user_id,
    ).all()
    for fee in linked_fees:
        apply_transaction_effect(db, fee, reverse=True)
        write_transaction_history(db, user_id, fee, "deleted")
        db.delete(fee)
    apply_transaction_effect(db, tx, reverse=True)
    write_transaction_history(db, user_id, tx, "deleted")
    db.delete(tx)
    db.commit()
