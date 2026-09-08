"""Family: accounts. Callers supply resolved user and database session."""
from app.application import ApplicationError
from sqlalchemy.orm import Session
from app.models.account import Account
from app.models.family import AccountFamilyAccess, FamilyMember
from app.services.notifications import notify_family_members
from app.services.family_context import require_family_owner, require_membership
from app.schemas.family_views import AccountAccessUpdate


def list_family_accounts(db: Session=None, user_id: int=None):
    membership = require_membership(db, user_id)
    members = db.query(FamilyMember).filter(
        FamilyMember.family_id == membership.family_id,
        FamilyMember.status == "active",
    ).order_by(FamilyMember.id).all()
    accounts = db.query(Account).filter(
        Account.family_id == membership.family_id,
        Account.is_shared.is_(True),
    ).order_by(Account.id).all()
    access_items = db.query(AccountFamilyAccess).filter(
        AccountFamilyAccess.account_id.in_([a.id for a in accounts])
    ).all() if accounts else []
    by_account: dict[int, list[dict]] = {account.id: [] for account in accounts}
    for item in access_items:
        by_account.setdefault(item.account_id, []).append({
            "user_id": item.user_id, "permission": item.permission,
        })
    return {
        "can_manage": membership.role == "owner",
        "members": [
            {"user_id": item.user_id, "email": item.email, "role": item.role}
            for item in members
        ],
        "accounts": [
            {
                "id": account.id,
                "name": account.name,
                "owner_user_id": account.user_id,
                "access": by_account.get(account.id, []),
            }
            for account in accounts
        ],
    }


def update_account_access(account_id: int, data: AccountAccessUpdate, db: Session=None, user_id: int=None):
    membership = require_membership(db, user_id)
    account = db.query(Account).filter(
        Account.id == account_id,
        Account.user_id == user_id,
    ).first()
    if not account:
        raise ApplicationError(status_code=404, detail="Можно настраивать доступ только к своему счёту")

    active_member_ids = {
        item.user_id for item in db.query(FamilyMember).filter(
            FamilyMember.family_id == membership.family_id,
            FamilyMember.status == "active",
        ).all()
        if item.user_id and item.user_id != user_id
    }
    requested = {item.user_id: item.permission for item in data.members}
    if not set(requested).issubset(active_member_ids):
        raise ApplicationError(status_code=400, detail="Можно выбрать только активных участников этой семьи")

    previous_recipient_ids = {
        item.user_id for item in db.query(AccountFamilyAccess).filter(
            AccountFamilyAccess.account_id == account.id
        ).all()
    }
    db.query(AccountFamilyAccess).filter(
        AccountFamilyAccess.account_id == account.id
    ).delete(synchronize_session=False)
    account.is_shared = bool(data.is_shared)
    account.family_id = membership.family_id if data.is_shared else None
    if data.is_shared:
        for target_user_id, permission in requested.items():
            db.add(AccountFamilyAccess(
                account_id=account.id,
                user_id=target_user_id,
                permission=permission,
            ))
    notify_family_members(
        db,
        family_id=membership.family_id,
        actor_user_id=user_id,
        recipient_ids=previous_recipient_ids | set(requested),
        event="family_access",
        title="Изменён доступ к общему счёту",
        message=f"Изменены настройки доступа к счёту «{account.name}».",
        link="/settings/family",
    )
    db.commit()
    return {"id": account.id, "is_shared": account.is_shared, "access": requested}


def member_settlement_accounts(member_id: int, db: Session=None, user_id: int=None):
    membership = require_family_owner(db, user_id)
    member = db.query(FamilyMember).filter(
        FamilyMember.id == member_id,
        FamilyMember.family_id == membership.family_id,
        FamilyMember.status == "active",
    ).first()
    if not member or not member.user_id or member.user_id == user_id:
        raise ApplicationError(status_code=404, detail="Участник семьи не найден")
    accounts = db.query(Account).filter(
        Account.user_id == member.user_id,
        Account.show_for_entries.is_(True),
    ).order_by(Account.sort_order, Account.name).all()
    return {
        "member_id": member.id,
        "accounts": [
            {
                "id": account.id,
                "name": account.name,
                "currencies": [balance.currency for balance in account.balances],
            }
            for account in accounts
        ],
    }
