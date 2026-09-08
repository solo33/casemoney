"""Protect linked financial records from partial edits through the generic API."""
from app.application import ApplicationError
from sqlalchemy import or_
from app.models.credit import CreditPayment
from app.models.family import FamilyExpenseAccounting, FamilySettlement
from app.models.transaction import Transaction

ECONOMIC_FIELDS = {"amount", "currency", "date", "type", "account_id", "to_account_id", "to_amount", "to_currency", "is_planned", "is_family_expense", "reimbursement_amount"}


def _link(db, tx):
    return db.query(FamilyExpenseAccounting).filter(or_(
        FamilyExpenseAccounting.source_transaction_id == tx.id,
        FamilyExpenseAccounting.owner_transaction_id == tx.id,
    )).first()


def _require_unsettled(db, link):
    if db.query(FamilySettlement.id).filter(
        FamilySettlement.family_id == link.family_id,
        FamilySettlement.to_user_id == link.source_user_id,
    ).first():
        raise ApplicationError(409, "Покупка связана с возмещениями. Изменение суммы или удаление требует отдельной корректировки взаиморасчётов")


def validate_edit(db, tx, updates):
    changed = {key for key, value in updates.items() if getattr(tx, key, None) != value}
    if not changed & ECONOMIC_FIELDS:
        return
    if db.query(CreditPayment.id).filter(CreditPayment.transaction_id == tx.id).first():
        raise ApplicationError(409, "Это платёж по обязательству. Нельзя менять его финансовые поля отдельно от истории кредита")
    link = _link(db, tx)
    if link and link.owner_transaction_id:
        _require_unsettled(db, link)
        if link.owner_transaction_id == tx.id and changed & (ECONOMIC_FIELDS - {"account_id"}):
            raise ApplicationError(409, "Измените исходную семейную покупку: её сумма и дата синхронизируются с вашим расходом")
        if changed & {"is_family_expense", "is_planned", "type"}:
            raise ApplicationError(409, "Сначала отмените перенос: удалите созданный расход из своего учёта")


def sync_copy(db, tx, link):
    if not link.owner_transaction_id:
        return
    from app.services.ledger import apply_transaction_effect, write_transaction_history
    from app.services.exchange import snapshot_transaction_rates
    target = db.get(Transaction, link.owner_transaction_id)
    if not target:
        return
    apply_transaction_effect(db, target, reverse=True)
    previous_amount, previous_currency = target.amount, target.currency
    target.amount, target.currency, target.date = tx.amount, tx.currency, tx.date
    target.description = tx.description
    snapshot_transaction_rates(db, target.user_id, target, force=previous_currency != tx.currency)
    apply_transaction_effect(db, target)
    write_transaction_history(db, target.user_id, target, "edited", prev_amount=previous_amount, prev_currency=previous_currency)


def before_delete(db, tx):
    if db.query(CreditPayment.id).filter(CreditPayment.transaction_id == tx.id).first():
        raise ApplicationError(409, "Это платёж по обязательству. Удаление отдельно от истории кредита запрещено")
    link = _link(db, tx)
    if not link or not link.owner_transaction_id:
        return
    _require_unsettled(db, link)
    if link.owner_transaction_id == tx.id:
        link.owner_transaction_id = None
        link.owner_account_id = None
        link.status = "pending"
        link.accepted_at = None
    else:
        from app.services.ledger import apply_transaction_effect, write_transaction_history
        target = db.get(Transaction, link.owner_transaction_id)
        if target:
            apply_transaction_effect(db, target, reverse=True)
            write_transaction_history(db, target.user_id, target, "deleted")
            db.delete(target)
        db.delete(link)
