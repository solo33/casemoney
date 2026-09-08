"""Accounts: commands. Callers supply resolved user and database session."""
from app.application import ApplicationError
from sqlalchemy.orm import Session
from app.models.account import Account
from app.models.account_balance import AccountBalance
from app.schemas.account import AccountCreate, AccountUpdate
from app.services import accounts as accounts_svc
from app.services import limits as limits_svc
from app.operations.accounts.common import _get_owned_account, _validate_group


def create_account(data: AccountCreate, db: Session=None, user_id: int=None):
    limits_svc.enforce_limit(db, user_id, "accounts")
    _validate_group(db, user_id, data.group_id)
    show_for_entries = (
        data.show_for_entries
        if "show_for_entries" in data.model_fields_set
        else data.include_in_balance
    )
    account = Account(
        name=data.name,
        type=data.type,
        color=data.color,
        icon=data.icon,
        group_id=data.group_id,
        include_in_balance=data.include_in_balance,
        show_for_entries=show_for_entries,
        note=data.note,
        user_id=user_id,
    )
    db.add(account)
    db.flush()  # получить account.id для balance

    # создаём первый AccountBalance
    initial = AccountBalance(
        account_id=account.id,
        currency=data.initial_currency.upper(),
        balance=data.initial_balance,
    )
    db.add(initial)
    db.commit()
    db.refresh(account)

    main = accounts_svc.get_user_main_currency(db, user_id)
    return accounts_svc.serialize_account(db, account, main)


def reorder_accounts(payload: dict, db: Session=None, user_id: int=None):
    """Задать порядок счетов. body: {"account_ids": [id, id, ...]} —
    sort_order назначается по позиции в списке. Опционально {"group_id": X}
    одновременно переносит все эти счета в указанную группу."""
    account_ids = payload.get("account_ids") or []
    if not isinstance(account_ids, list):
        raise ApplicationError(status_code=400, detail="account_ids должен быть списком")

    target_group = payload.get("group_id", "__keep__")
    if target_group != "__keep__":
        _validate_group(db, user_id, target_group)

    # Берём только счета этого пользователя
    owned = {
        a.id: a for a in db.query(Account).filter(
            Account.user_id == user_id,
            Account.id.in_([int(x) for x in account_ids]),
        ).all()
    }
    for idx, aid in enumerate(account_ids):
        acc = owned.get(int(aid))
        if not acc:
            continue
        acc.sort_order = idx
        if target_group != "__keep__":
            acc.group_id = target_group
    db.commit()


def update_account(account_id: int, data: AccountUpdate, db: Session=None, user_id: int=None):
    account = _get_owned_account(db, account_id, user_id)
    update_fields = data.model_dump(exclude_unset=True)
    if "group_id" in update_fields:
        _validate_group(db, user_id, update_fields["group_id"])
    for key, value in update_fields.items():
        setattr(account, key, value)
    db.commit()
    db.refresh(account)
    main = accounts_svc.get_user_main_currency(db, user_id)
    return accounts_svc.serialize_account(db, account, main)


def delete_account(account_id: int, db: Session=None, user_id: int=None):
    account = _get_owned_account(db, account_id, user_id)
    db.delete(account)
    db.commit()
