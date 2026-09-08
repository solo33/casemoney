"""Accounts: queries. Callers supply resolved user and database session."""
from sqlalchemy.orm import Session, selectinload
from typing import Optional
from app.models.account import Account
from app.models.account_group import AccountGroup
from app.schemas.account import AccountGroupBucket, GroupSummary
from app.services import accounts as accounts_svc
from app.services import family_accounts as family_accounts_svc
from app.operations.accounts.common import _get_account


def get_accounts(db: Session=None, user_id: int=None):
    """Плоский список со всеми балансами и total_in_main."""
    main = accounts_svc.get_user_main_currency(db, user_id)
    accounts = (
        family_accounts_svc.accessible_accounts(db, user_id)
        .options(selectinload(Account.balances))
        .all()
    )
    accounts_svc.prime_account_rates(db, accounts, main, user_id=user_id)
    return [
        accounts_svc.serialize_account(
            db, a, main, access_level=family_accounts_svc.access_level(db, a, user_id), conversion_user_id=user_id
        )
        for a in accounts
    ]


def get_accounts_grouped(convert_balances: bool=True, db: Session=None, user_id: int=None):
    """Сгруппированный список. total_in_main для группы = сумма total_in_main счетов."""
    main = accounts_svc.get_user_main_currency(db, user_id)
    groups = (
        db.query(AccountGroup)
        .filter(AccountGroup.user_id == user_id)
        .order_by(AccountGroup.sort_order, AccountGroup.id)
        .all()
    )
    accounts = (
        family_accounts_svc.accessible_accounts(db, user_id)
        .options(selectinload(Account.balances))
        .order_by(Account.sort_order, Account.id)
        .all()
    )
    if convert_balances:
        accounts_svc.prime_account_rates(db, accounts, main, user_id=user_id)

    by_group: dict[Optional[int], list[Account]] = {}
    for a in accounts:
        by_group.setdefault(a.group_id, []).append(a)

    result: list[AccountGroupBucket] = []
    for g in groups:
        bucket_accounts = [a for a in by_group.get(g.id, []) if a.user_id == user_id]
        serialized = [
            accounts_svc.serialize_account(
                db, a, main, convert_balances=convert_balances,
                access_level=family_accounts_svc.access_level(db, a, user_id), conversion_user_id=user_id,
            )
            for a in bucket_accounts
        ]
        result.append(AccountGroupBucket(
            group=GroupSummary(id=g.id, name=g.name, sort_order=g.sort_order),
            accounts=serialized,
            # Итог группы — сумма ВСЕХ счетов группы, независимо от include_in_balance.
            # Общий баланс дашборда (dashboard.total_balance) фильтрует по этому флагу
            # отдельно — здесь это просто справочная сумма по группе.
            total_in_main=round(sum(a.total_in_main for a in serialized), 2) if all(a.total_in_main is not None for a in serialized) else None,
        ))

    ungrouped = [a for a in by_group.get(None, []) if a.user_id == user_id]
    if ungrouped:
        serialized = [
            accounts_svc.serialize_account(
                db, a, main, convert_balances=convert_balances,
                access_level=family_accounts_svc.access_level(db, a, user_id), conversion_user_id=user_id,
            )
            for a in ungrouped
        ]
        result.append(AccountGroupBucket(
            group=GroupSummary(id=None, name="Без группы", sort_order=10_000),
            accounts=serialized,
            total_in_main=round(sum(a.total_in_main for a in serialized), 2) if all(a.total_in_main is not None for a in serialized) else None,
        ))

    shared = [a for a in accounts if a.user_id != user_id]
    if shared:
        serialized = [
            accounts_svc.serialize_account(
                db, a, main, convert_balances=convert_balances,
                access_level=family_accounts_svc.access_level(db, a, user_id), conversion_user_id=user_id,
            )
            for a in shared
        ]
        result.append(AccountGroupBucket(
            group=GroupSummary(id=None, name="Общие семейные счета", sort_order=9_999),
            accounts=serialized,
            total_in_main=round(sum(a.total_in_main for a in serialized), 2) if all(a.total_in_main is not None for a in serialized) else None,
        ))

    return result


def list_balances(account_id: int, db: Session=None, user_id: int=None):
    account = _get_account(db, account_id, user_id)
    family_accounts_svc.require_write_access(db, account_id, user_id)
    main = accounts_svc.get_user_main_currency(db, user_id)
    serialized = accounts_svc.serialize_account(db, account, main)
    return serialized.balances
