from calendar import monthrange
from datetime import datetime, timezone
import html
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.dependencies import current_user_id, require_family_user_id
from app.database import get_db
from app.models.account import Account
from app.models.budget import Budget
from app.models.category import Category
from app.models.family import (
    AccountFamilyAccess,
    Family,
    FamilyCategoryMapping,
    FamilyExpenseAccounting,
    FamilyMember,
    FamilySettlement,
)
from app.models.family_recurring_suggestion import FamilyRecurringSuggestionDecision
from app.models.goal import Goal, GoalContribution
from app.models.recurring_transaction import RecurringTransaction
from app.models.transaction import Transaction, TransactionType
from app.models.user import User
from app.services.email import app_url, send_email
from app.services.notifications import notify_family_members, notify_user
from app.services import accounts as accounts_svc
from app.services import app_config as app_config_svc
from app.services import exchange as exchange_svc
from app.services.family_recurring import find_family_recurring_suggestions
from app.services.family_report import (
    build_family_report_email_html,
    build_family_report_pdf,
    report_period_label,
)

router = APIRouter(
    prefix="/api/family",
    tags=["family"],
    dependencies=[Depends(require_family_user_id)],
)

# После включения оплаты Family оплачивается для трёх адресов вместе с владельцем.
FAMILY_MAX_MEMBERS = 3


def active_membership(db: Session, user_id: int) -> Optional[FamilyMember]:
    return db.query(FamilyMember).filter(
        FamilyMember.user_id == user_id,
        FamilyMember.status == "active",
    ).first()


def require_membership(db: Session, user_id: int) -> FamilyMember:
    member = active_membership(db, user_id)
    if not member:
        raise HTTPException(status_code=404, detail="Семейное пространство не настроено")
    return member


class FamilyCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)


class InviteCreate(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    role: Literal["editor", "viewer"] = "editor"


class MemberRoleUpdate(BaseModel):
    role: Literal["editor", "viewer"]


class AccountAccessItem(BaseModel):
    user_id: int
    permission: Literal["editor", "viewer"]


class AccountAccessUpdate(BaseModel):
    is_shared: bool
    members: list[AccountAccessItem] = []


class SettlementCreate(BaseModel):
    to_user_id: int
    from_account_id: int
    to_account_id: int
    amount: float = Field(gt=0)
    currency: str = Field(min_length=2, max_length=10)
    date: Optional[datetime] = None
    description: Optional[str] = Field(None, max_length=500)


class FamilyExpenseAccept(BaseModel):
    owner_category_id: int


class FamilyAnalyticsExportRequest(BaseModel):
    year: int = Field(ge=2000, le=2200)
    month: int = Field(ge=1, le=12)


def _user_label(user: Optional[User], email: str) -> str:
    if user and user.username:
        return user.username
    return email


def family_payload(db: Session, family: Family, current_user_id: int) -> dict:
    members = db.query(FamilyMember).filter(
        FamilyMember.family_id == family.id
    ).order_by(FamilyMember.id).all()
    users = {
        user.id: user
        for user in db.query(User).filter(
            User.id.in_([m.user_id for m in members if m.user_id])
        ).all()
    }
    return {
        "id": family.id,
        "name": family.name,
        "owner_user_id": family.owner_user_id,
        "current_user_id": current_user_id,
        "current_user_role": next(
            (m.role for m in members if m.user_id == current_user_id), None
        ),
        "members": [
            {
                "id": member.id,
                "user_id": member.user_id,
                "email": member.email,
                "name": _user_label(users.get(member.user_id), member.email),
                "role": member.role,
                "status": member.status,
            }
            for member in members
        ],
    }


def _require_family_owner(db: Session, user_id: int) -> FamilyMember:
    membership = require_membership(db, user_id)
    if membership.role != "owner":
        raise HTTPException(status_code=403, detail="Это действие доступно владельцу семейного пространства")
    return membership


def _ensure_family_accounting_rows(db: Session, family_id: int) -> bool:
    """Backfill queue rows for common purchases created before this feature."""
    family = db.query(Family).filter(Family.id == family_id).first()
    if not family:
        return False
    created = False
    existing_ids = {
        item[0]
        for item in db.query(FamilyExpenseAccounting.source_transaction_id).filter(
            FamilyExpenseAccounting.family_id == family_id
        ).all()
    }
    rows = db.query(Transaction).filter(
        Transaction.family_id == family_id,
        Transaction.is_family_expense.is_(True),
        Transaction.type == TransactionType.expense,
        Transaction.is_planned.is_(False),
    ).all()
    for tx in rows:
        if tx.id in existing_ids:
            continue
        is_owner_purchase = tx.user_id == family.owner_user_id
        db.add(FamilyExpenseAccounting(
            family_id=family_id,
            source_transaction_id=tx.id,
            source_user_id=tx.user_id,
            owner_user_id=family.owner_user_id,
            source_category_id=tx.category_id,
            owner_category_id=tx.category_id if is_owner_purchase else None,
            status="accepted" if is_owner_purchase else "pending",
            accepted_at=datetime.now(timezone.utc) if is_owner_purchase else None,
        ))
        created = True
    return created


def _accounting_rows_query(db: Session, family_id: int):
    # Legacy common purchases need a durable queue record, otherwise the item
    # would disappear between the GET request and the owner's confirmation.
    if _ensure_family_accounting_rows(db, family_id):
        db.commit()
    return db.query(FamilyExpenseAccounting).filter(
        FamilyExpenseAccounting.family_id == family_id
    )


@router.get("/")
def get_family(
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
):
    user = db.query(User).filter(User.id == user_id).first()
    member = active_membership(db, user_id)
    pending = db.query(FamilyMember).filter(
        FamilyMember.status == "pending",
        func.lower(FamilyMember.email) == user.email.lower(),
    ).all()
    if not member:
        return {
            "family": None,
            "pending_invitations": [
                {
                    "id": invitation.id,
                    "family_id": invitation.family_id,
                    "family_name": db.query(Family.name).filter(
                        Family.id == invitation.family_id
                    ).scalar(),
                    "email": invitation.email,
                }
                for invitation in pending
            ],
        }
    family = db.query(Family).filter(Family.id == member.family_id).first()
    return {
        "family": family_payload(db, family, user_id),
        "pending_invitations": [],
    }


@router.post("/", status_code=201)
def create_family(
    data: FamilyCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
):
    if active_membership(db, user_id):
        raise HTTPException(status_code=409, detail="Вы уже состоите в семье")
    user = db.query(User).filter(User.id == user_id).first()
    if db.query(FamilyMember).filter(
        FamilyMember.status == "pending",
        func.lower(FamilyMember.email) == user.email.lower(),
    ).first():
        raise HTTPException(status_code=409, detail="Сначала примите или отклоните приглашение в семью")
    family = Family(name=data.name.strip(), owner_user_id=user_id)
    db.add(family)
    db.flush()
    db.add(FamilyMember(
        family_id=family.id,
        user_id=user_id,
        email=user.email.lower(),
        role="owner",
        status="active",
        invited_by_user_id=user_id,
        accepted_at=datetime.now(timezone.utc),
    ))
    db.commit()
    db.refresh(family)
    return family_payload(db, family, user_id)


@router.post("/invite", status_code=201)
def invite_member(
    data: InviteCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
):
    membership = require_membership(db, user_id)
    if membership.role != "owner":
        raise HTTPException(status_code=403, detail="Приглашать участников может владелец")
    email = data.email.strip().lower()
    user = db.query(User).filter(func.lower(User.email) == email).first()
    existing = db.query(FamilyMember).filter(
        FamilyMember.family_id == membership.family_id,
        func.lower(FamilyMember.email) == email,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Пользователь уже приглашён")
    if user and active_membership(db, user.id):
        raise HTTPException(status_code=409, detail="Пользователь уже состоит в другой семье")
    member_count = db.query(FamilyMember).filter(FamilyMember.family_id == membership.family_id).count()
    if app_config_svc.is_billing_enabled(db) and member_count >= FAMILY_MAX_MEMBERS:
        raise HTTPException(
            status_code=400,
            detail=f"В семейном пространстве уже максимум участников ({FAMILY_MAX_MEMBERS})",
        )
    invitation = FamilyMember(
        family_id=membership.family_id,
        user_id=user.id if user else None,
        email=email,
        role=data.role,
        status="pending",
        invited_by_user_id=user_id,
    )
    db.add(invitation)
    family_name = db.query(Family.name).filter(
        Family.id == membership.family_id
    ).scalar()
    invitation_title = "Приглашение в семейное пространство"
    invitation_message = (
        f"Вас пригласили в семейное пространство «{family_name}». "
        "Примите приглашение, чтобы участвовать в общих финансах."
    )
    if user:
        notify_user(
            db, user, event="family_invitation", title=invitation_title,
            message=invitation_message, link="/settings/family",
        )
    db.commit()
    db.refresh(invitation)
    invite_url = f"{app_url()}/settings/family"
    safe_family_name = html.escape(family_name)
    safe_email = html.escape(email)
    safe_invite_url = html.escape(invite_url, quote=True)
    if not user:
        send_email(
            email,
            f"Приглашение в семейные финансы CaseMoney — {family_name}",
            (
                f"Вас пригласили в семейное пространство «{family_name}».\n"
                f"Войдите в CaseMoney под адресом {email} и примите приглашение:\n"
                f"{invite_url}"
            ),
            (
                f"<p>Вас пригласили в семейное пространство "
                f"<strong>«{safe_family_name}»</strong>.</p>"
                f"<p>Войдите в CaseMoney под адресом {safe_email} и "
                f"<a href=\"{safe_invite_url}\">примите приглашение</a>.</p>"
            ),
        )
    return {"id": invitation.id, "email": email, "status": "pending"}


@router.patch("/members/{member_id}/role")
def update_member_role(
    member_id: int,
    data: MemberRoleUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
):
    membership = _require_family_owner(db, user_id)
    target = db.query(FamilyMember).filter(
        FamilyMember.id == member_id,
        FamilyMember.family_id == membership.family_id,
    ).first()
    if not target:
        raise HTTPException(status_code=404, detail="Участник не найден")
    if target.role == "owner":
        raise HTTPException(status_code=400, detail="Роль владельца нельзя изменить")
    target.role = data.role
    notify_family_members(
        db,
        family_id=membership.family_id,
        actor_user_id=user_id,
        recipient_ids={target.user_id} if target.user_id else set(),
        event="family_access",
        title="Изменена роль в семье",
        message=f"Ваша роль в семейном пространстве изменена на «{data.role}».",
        link="/settings/family",
    )
    db.commit()
    return {"id": target.id, "role": target.role}


@router.get("/accounts")
def list_family_accounts(
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
):
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


@router.put("/accounts/{account_id}/access")
def update_account_access(
    account_id: int,
    data: AccountAccessUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
):
    membership = require_membership(db, user_id)
    account = db.query(Account).filter(
        Account.id == account_id,
        Account.user_id == user_id,
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Можно настраивать доступ только к своему счёту")

    active_member_ids = {
        item.user_id for item in db.query(FamilyMember).filter(
            FamilyMember.family_id == membership.family_id,
            FamilyMember.status == "active",
        ).all()
        if item.user_id and item.user_id != user_id
    }
    requested = {item.user_id: item.permission for item in data.members}
    if not set(requested).issubset(active_member_ids):
        raise HTTPException(status_code=400, detail="Можно выбрать только активных участников этой семьи")

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


@router.delete("/members/{member_id}", status_code=204)
def remove_member(
    member_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
):
    """Убрать участника из семьи — владельцем (в т.ч. пока приглашение ещё
    не принято) или самим участником (выход из семьи)."""
    membership = require_membership(db, user_id)
    target = db.query(FamilyMember).filter(
        FamilyMember.id == member_id,
        FamilyMember.family_id == membership.family_id,
    ).first()
    if not target:
        raise HTTPException(status_code=404, detail="Участник не найден")

    is_self = target.user_id == user_id
    if not is_self and membership.role != "owner":
        raise HTTPException(status_code=403, detail="Удалять участников может только владелец")
    if target.role == "owner":
        raise HTTPException(status_code=400, detail="Нельзя удалить владельца семьи")

    db.delete(target)
    db.commit()


@router.post("/invitations/{invitation_id}/accept")
def accept_invitation(
    invitation_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
):
    user = db.query(User).filter(User.id == user_id).first()
    invitation = db.query(FamilyMember).filter(
        FamilyMember.id == invitation_id,
        FamilyMember.status == "pending",
        func.lower(FamilyMember.email) == user.email.lower(),
    ).first()
    if not invitation:
        raise HTTPException(status_code=404, detail="Приглашение не найдено")
    if active_membership(db, user_id):
        raise HTTPException(status_code=409, detail="Вы уже состоите в семье")
    invitation.user_id = user_id
    invitation.status = "active"
    invitation.accepted_at = datetime.now(timezone.utc)
    family = db.query(Family).filter(Family.id == invitation.family_id).first()
    actor_name = user.username if user.username else user.email
    notify_family_members(
        db,
        family_id=invitation.family_id,
        actor_user_id=user_id,
        recipient_ids={family.owner_user_id} if family else set(),
        event="family_invitation",
        title="Приглашение принято",
        message=f"{actor_name} присоединился(ась) к семейному пространству.",
        link="/settings/family",
    )
    db.commit()
    return family_payload(db, family, user_id)


@router.get("/expense-accounting/pending")
def pending_family_expense_accounting(
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
):
    membership = _require_family_owner(db, user_id)
    rows = _accounting_rows_query(db, membership.family_id).filter(
        FamilyExpenseAccounting.owner_user_id == user_id,
        FamilyExpenseAccounting.status == "pending",
    ).order_by(FamilyExpenseAccounting.created_at.asc()).all()
    tx_ids = [item.source_transaction_id for item in rows]
    transactions = {
        item.id: item for item in db.query(Transaction).filter(Transaction.id.in_(tx_ids)).all()
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
    }


@router.post("/expense-accounting/{accounting_id}/accept")
def accept_family_expense_accounting(
    accounting_id: int,
    data: FamilyExpenseAccept,
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
):
    membership = _require_family_owner(db, user_id)
    item = db.query(FamilyExpenseAccounting).filter(
        FamilyExpenseAccounting.id == accounting_id,
        FamilyExpenseAccounting.family_id == membership.family_id,
        FamilyExpenseAccounting.owner_user_id == user_id,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Общая покупка не найдена")
    if item.status == "accepted":
        raise HTTPException(status_code=409, detail="Эта покупка уже учтена")
    owner_category = db.query(Category).filter(
        Category.id == data.owner_category_id,
        Category.user_id == user_id,
        Category.type == "expense",
    ).first()
    if not owner_category:
        raise HTTPException(status_code=400, detail="Выберите свою расходную категорию")
    item.owner_category_id = owner_category.id
    item.status = "accepted"
    item.accepted_at = datetime.now(timezone.utc)
    if item.source_category_id:
        mapping = db.query(FamilyCategoryMapping).filter(
            FamilyCategoryMapping.family_id == membership.family_id,
            FamilyCategoryMapping.source_user_id == item.source_user_id,
            FamilyCategoryMapping.source_category_id == item.source_category_id,
            FamilyCategoryMapping.owner_user_id == user_id,
        ).first()
        if mapping:
            mapping.owner_category_id = owner_category.id
        else:
            db.add(FamilyCategoryMapping(
                family_id=membership.family_id,
                source_user_id=item.source_user_id,
                source_category_id=item.source_category_id,
                owner_user_id=user_id,
                owner_category_id=owner_category.id,
            ))
    source_user = db.query(User).filter(User.id == item.source_user_id).first()
    if source_user:
        notify_user(
            db,
            source_user,
            event="family_expense_accounted",
            title="Общая покупка учтена",
            message="Владелец семьи включил вашу общую покупку в семейный учёт.",
            link="/settings/family",
        )
    db.commit()
    return {"id": item.id, "status": item.status, "owner_category_id": item.owner_category_id}


@router.get("/members/{member_id}/settlement-accounts")
def member_settlement_accounts(
    member_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
):
    membership = _require_family_owner(db, user_id)
    member = db.query(FamilyMember).filter(
        FamilyMember.id == member_id,
        FamilyMember.family_id == membership.family_id,
        FamilyMember.status == "active",
    ).first()
    if not member or not member.user_id or member.user_id == user_id:
        raise HTTPException(status_code=404, detail="Участник семьи не найден")
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


@router.get("/report")
def family_report(
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
):
    membership = require_membership(db, user_id)
    members = db.query(FamilyMember).filter(
        FamilyMember.family_id == membership.family_id,
        FamilyMember.status == "active",
    ).all()
    member_ids = [member.user_id for member in members]
    users = {
        user.id: user
        for user in db.query(User).filter(User.id.in_(member_ids)).all()
    }
    accounting_rows = _accounting_rows_query(db, membership.family_id).filter(
        FamilyExpenseAccounting.status == "accepted"
    ).all()
    accounting_by_tx_id = {item.source_transaction_id: item for item in accounting_rows}
    source_ids = list(accounting_by_tx_id)
    expenses = db.query(Transaction).filter(
        Transaction.id.in_(source_ids)
    ).order_by(Transaction.date.desc(), Transaction.id.desc()).all() if source_ids else []
    settlements = db.query(FamilySettlement).filter(
        FamilySettlement.family_id == membership.family_id
    ).order_by(FamilySettlement.date.desc(), FamilySettlement.id.desc()).all()

    account_ids = {item.account_id for item in expenses}
    category_ids = {
        accounting_by_tx_id[item.id].owner_category_id or item.category_id
        for item in expenses
        if accounting_by_tx_id[item.id].owner_category_id or item.category_id
    }
    account_names = dict(
        db.query(Account.id, Account.name).filter(Account.id.in_(account_ids)).all()
    ) if account_ids else {}
    category_names = dict(
        db.query(Category.id, Category.name).filter(Category.id.in_(category_ids)).all()
    ) if category_ids else {}

    outstanding: dict[tuple[int, str], float] = {}
    totals: dict[str, float] = {}
    for item in expenses:
        key = (item.user_id, item.currency)
        outstanding[key] = outstanding.get(key, 0) + item.reimbursement_amount
        totals[item.currency] = totals.get(item.currency, 0) + item.amount
    for item in settlements:
        key = (item.to_user_id, item.currency)
        outstanding[key] = outstanding.get(key, 0) - item.amount

    return {
        "expenses": [
            {
                "id": item.id,
                "date": item.date,
                "amount": item.amount,
                "currency": item.currency,
                "reimbursement_amount": item.reimbursement_amount,
                "description": item.description,
                "paid_by_user_id": item.user_id,
                "paid_by_name": _user_label(users.get(item.user_id), ""),
                "account_name": account_names.get(item.account_id),
                "category_name": category_names.get(
                    accounting_by_tx_id[item.id].owner_category_id or item.category_id
                ),
            }
            for item in expenses
        ],
        "settlements": [
            {
                "id": item.id,
                "date": item.date,
                "amount": item.amount,
                "currency": item.currency,
                "description": item.description,
                "from_user_id": item.from_user_id,
                "from_name": _user_label(users.get(item.from_user_id), ""),
                "to_user_id": item.to_user_id,
                "to_name": _user_label(users.get(item.to_user_id), ""),
            }
            for item in settlements
        ],
        "totals": [
            {"currency": currency, "amount": amount}
            for currency, amount in sorted(totals.items())
        ],
        "outstanding": [
            {
                "user_id": recipient_id,
                "name": _user_label(users.get(recipient_id), ""),
                "currency": currency,
                "amount": round(amount, 2),
            }
            for (recipient_id, currency), amount in sorted(outstanding.items())
            if abs(amount) >= 0.005
        ],
    }


def _convert_or_skip(
    db: Session, user_id: int, amount: float, currency: str, main_currency: str, skipped_currencies: set[str], *, transaction=None,
) -> Optional[float]:
    """Конвертирует сумму, а при недоступном курсе — запоминает валюту и возвращает None."""
    try:
        if transaction is not None:
            return exchange_svc.convert_transaction_for_user(db, user_id, transaction, main_currency)
        return exchange_svc.convert_for_user(db, user_id, amount, currency, main_currency)
    except exchange_svc.ExchangeError:
        skipped_currencies.add(currency)
        return None


def _family_analytics_data(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
):
    """Monthly Family report without exposing private account balances.

    Only operations that a participant explicitly marked as family-related are
    included.  This keeps private accounts and personal spending out of the
    shared report while still making the household picture useful.
    """
    if month < 1 or month > 12:
        raise HTTPException(status_code=422, detail="Месяц должен быть от 1 до 12")

    membership = require_membership(db, user_id)
    start = datetime(year, month, 1, tzinfo=timezone.utc)
    end = datetime(year + (month == 12), 1 if month == 12 else month + 1, 1, tzinfo=timezone.utc)
    main_currency = accounts_svc.get_user_main_currency(db, user_id)

    members = db.query(FamilyMember).filter(
        FamilyMember.family_id == membership.family_id,
        FamilyMember.status == "active",
    ).all()
    users = {
        item.id: item
        for item in db.query(User).filter(User.id.in_([member.user_id for member in members])).all()
    }

    accepted_rows = _accounting_rows_query(db, membership.family_id).filter(
        FamilyExpenseAccounting.status == "accepted"
    ).all()
    accepted_by_tx_id = {item.source_transaction_id: item for item in accepted_rows}
    accepted_ids = list(accepted_by_tx_id)
    actual_transactions = db.query(Transaction).filter(
        Transaction.id.in_(accepted_ids),
        Transaction.date >= start,
        Transaction.date < end,
    ).all() if accepted_ids else []
    # A plan is explicitly shared, but it has no completed purchase yet and
    # therefore no accounting-row confirmation.  Include it in forecasts
    # directly; actual member purchases still require owner acceptance above.
    planned_query = db.query(Transaction).filter(
        Transaction.family_id == membership.family_id,
        Transaction.is_family_expense.is_(True),
        Transaction.is_planned.is_(True),
        Transaction.date >= start,
        Transaction.date < end,
    )
    if accepted_ids:
        planned_query = planned_query.filter(Transaction.id.notin_(accepted_ids))
    planned_transactions = planned_query.all()
    transactions = actual_transactions + planned_transactions
    previous_end = start
    previous_start = datetime(
        year - (month == 1), 12 if month == 1 else month - 1, 1, tzinfo=timezone.utc,
    )
    previous_transactions = db.query(Transaction).filter(
        Transaction.id.in_(accepted_ids),
        Transaction.date >= previous_start,
        Transaction.date < previous_end,
    ).all() if accepted_ids else []
    category_names = dict(db.query(Category.id, Category.name).all())

    actual_expenses = 0.0
    actual_income = 0.0
    planned_expenses = 0.0
    planned_income = 0.0
    per_member: dict[int, float] = {}
    per_category: dict[str, float] = {}
    planned_per_category: dict[str, float] = {}
    skipped_currencies: set[str] = set()
    notable_expenses: list[dict] = []
    converted_amounts: dict[int, float] = {}

    for item in transactions:
        amount = _convert_or_skip(db, item.user_id, item.amount, item.currency, main_currency, skipped_currencies, transaction=item)
        if amount is None:
            continue
        converted_amounts[item.id] = amount
        if item.is_planned:
            if item.type == TransactionType.expense:
                planned_expenses += amount
                accounting = accepted_by_tx_id.get(item.id)
                category_id = accounting.owner_category_id if accounting else item.category_id
                name = category_names.get(category_id, "Без категории")
                planned_per_category[name] = planned_per_category.get(name, 0.0) + amount
            elif item.type == TransactionType.income:
                planned_income += amount
            continue
        if item.type == TransactionType.income:
            actual_income += amount
            continue
        if item.type != TransactionType.expense:
            continue
        actual_expenses += amount
        per_member[item.user_id] = per_member.get(item.user_id, 0.0) + amount
        accounting = accepted_by_tx_id.get(item.id)
        category_id = accounting.owner_category_id if accounting else item.category_id
        name = category_names.get(category_id, "Без категории")
        per_category[name] = per_category.get(name, 0.0) + amount
        notable_expenses.append({
            "id": item.id,
            "description": item.description or name,
            "category_name": name,
            "paid_by_name": _user_label(users.get(item.user_id), ""),
            "date": item.date,
            "amount": round(amount, 2),
        })

    previous_expenses = 0.0
    previous_income = 0.0
    for item in previous_transactions:
        if item.is_planned or item.type not in {TransactionType.expense, TransactionType.income}:
            continue
        amount = _convert_or_skip(db, item.user_id, item.amount, item.currency, main_currency, skipped_currencies, transaction=item)
        if amount is None:
            continue
        if item.type == TransactionType.expense:
            previous_expenses += amount
        else:
            previous_income += amount

    settlements = db.query(FamilySettlement).filter(
        FamilySettlement.family_id == membership.family_id,
        FamilySettlement.date >= start,
        FamilySettlement.date < end,
    ).order_by(FamilySettlement.date.desc(), FamilySettlement.id.desc()).all()
    settlement_rows = []
    settlements_total = 0.0
    for item in settlements:
        amount = _convert_or_skip(db, user_id, item.amount, item.currency, main_currency, skipped_currencies)
        if amount is None:
            continue
        settlements_total += amount
        settlement_rows.append({
            "id": item.id,
            "from_name": _user_label(users.get(item.from_user_id), ""),
            "to_name": _user_label(users.get(item.to_user_id), ""),
            "amount": round(amount, 2),
            "date": item.date,
            "description": item.description,
        })

    budget_plan = 0.0
    budgets = db.query(Budget).filter(
        Budget.user_id == user_id,
        Budget.scope == "family",
        Budget.period == "month",
        Budget.period_start == start.date(),
    ).all()
    for item in budgets:
        converted = _convert_or_skip(db, user_id, item.amount, item.currency, main_currency, skipped_currencies)
        if converted is not None:
            budget_plan += converted

    now = datetime.now(timezone.utc)
    is_current_period = now.year == year and now.month == month
    total_days = monthrange(year, month)[1]
    days_elapsed = now.day if is_current_period else total_days if now > end else 0
    days_remaining = total_days - days_elapsed if is_current_period else 0
    average_daily_expenses = actual_expenses / days_elapsed if days_elapsed else 0.0
    predicted_expenses = actual_expenses + planned_expenses + average_daily_expenses * days_remaining
    predicted_income = actual_income + planned_income

    budget_risks = []
    for item in budgets:
        category_name = category_names.get(item.category_id)
        if not category_name:
            continue
        limit = _convert_or_skip(db, user_id, item.amount, item.currency, main_currency, skipped_currencies)
        if limit is None:
            continue
        category_actual = per_category.get(category_name, 0.0)
        category_planned = planned_per_category.get(category_name, 0.0)
        category_forecast = category_actual + category_planned + (
            category_actual / days_elapsed * days_remaining if days_elapsed else 0.0
        )
        if is_current_period and category_forecast > limit:
            budget_risks.append({
                "category_name": category_name,
                "limit": round(limit, 2),
                "forecast": round(category_forecast, 2),
                "overrun": round(category_forecast - limit, 2),
            })
    budget_risks.sort(key=lambda item: item["overrun"], reverse=True)

    upcoming = []
    if is_current_period:
        for item in transactions:
            item_date = item.date if item.date.tzinfo else item.date.replace(tzinfo=timezone.utc)
            # A plan for today is still an upcoming item until the user marks it
            # complete.  Compare calendar dates rather than the creation time.
            if not item.is_planned or item_date.date() < now.date() or item.type not in {TransactionType.expense, TransactionType.income}:
                continue
            # Already converted in the pass over `transactions` above — reuse it
            # instead of calling convert_for_user a second time for the same item.
            amount = converted_amounts.get(item.id)
            if amount is None:
                continue
            upcoming.append({
                "id": item.id,
                "date": item_date,
                "type": item.type.value,
                "amount": round(amount, 2),
                "description": item.description or category_names.get(item.category_id) or "Запланированная операция",
            })
        upcoming.sort(key=lambda item: item["date"])

    def _change(current: float, previous: float) -> dict:
        amount = round(current - previous, 2)
        return {
            "amount": amount,
            "percent": round(amount / previous * 100, 1) if previous else None,
        }

    member_rows = [
        {
            "user_id": member.user_id,
            "name": _user_label(users.get(member.user_id), member.email),
            "actual": round(per_member.get(member.user_id, 0.0), 2),
        }
        for member in members
    ]
    category_rows = [
        {"name": name, "actual": round(amount, 2)}
        for name, amount in sorted(per_category.items(), key=lambda pair: pair[1], reverse=True)
    ]
    notable_expenses.sort(key=lambda item: item["amount"], reverse=True)
    actual_total = actual_expenses
    planned_total = planned_expenses
    month_summary = []
    predicted_net = predicted_income - predicted_expenses
    if is_current_period:
        if predicted_net < 0:
            month_summary.append({
                "kind": "deficit",
                "title": "Вероятен дефицит общих денег",
                "amount": round(abs(predicted_net), 2),
                "description": "Прогноз расходов до конца месяца превышает ожидаемые общие доходы.",
            })
        else:
            month_summary.append({
                "kind": "reserve",
                "title": "Прогноз общего остатка положительный",
                "amount": round(predicted_net, 2),
                "description": "Это прогноз по общим операциям, а не сумма на личных счетах участников.",
            })
    if budget_risks:
        top_risk = budget_risks[0]
        month_summary.append({
            "kind": "budget_risk",
            "title": f"Риск превышения бюджета: {top_risk['category_name']}",
            "amount": top_risk["overrun"],
            "description": "Расходы по текущему темпу и запланированным операциям могут превысить лимит.",
        })
    if category_rows:
        largest_category = category_rows[0]
        month_summary.append({
            "kind": "largest_category",
            "title": f"Главная статья общих расходов: {largest_category['name']}",
            "amount": largest_category["actual"],
            "description": "Больше всего фактически потрачено в этой категории за выбранный месяц.",
        })
    goal_rows = []
    shared_goals = db.query(Goal).filter(
        Goal.family_id == membership.family_id,
        Goal.is_archived.is_(False),
    ).order_by(Goal.sort_order, Goal.id).all()
    for goal in shared_goals:
        current_in_goal_currency = goal.current_amount
        if goal.account_id:
            account = db.query(Account).filter(Account.id == goal.account_id).first()
            if account:
                current_in_goal_currency = 0.0
                for balance in account.balances:
                    converted = _convert_or_skip(
                        db, goal.user_id, balance.balance, balance.currency,
                        goal.currency, skipped_currencies,
                    )
                    if converted is not None:
                        current_in_goal_currency += converted
        all_contributions = db.query(GoalContribution).filter(
            GoalContribution.goal_id == goal.id,
        ).all()
        current_in_goal_currency += sum(item.amount for item in all_contributions)
        monthly_contributions = 0.0
        for item in all_contributions:
            contribution_date = item.created_at
            if not contribution_date:
                continue
            # SQLite in tests may return a naive value even for a timezone-aware
            # column, while PostgreSQL returns UTC-aware datetimes.
            if contribution_date.tzinfo is None:
                contribution_date = contribution_date.replace(tzinfo=timezone.utc)
            if start <= contribution_date < end:
                monthly_contributions += item.amount
        target = _convert_or_skip(
            db, goal.user_id, goal.target_amount, goal.currency,
            main_currency, skipped_currencies,
        )
        current = _convert_or_skip(
            db, goal.user_id, current_in_goal_currency, goal.currency,
            main_currency, skipped_currencies,
        )
        monthly = _convert_or_skip(
            db, goal.user_id, monthly_contributions, goal.currency,
            main_currency, skipped_currencies,
        )
        if target is None or current is None:
            continue
        goal_rows.append({
            "id": goal.id,
            "name": goal.name,
            "target_amount": round(target, 2),
            "current_amount": round(current, 2),
            "monthly_contribution": round(monthly or 0.0, 2),
            "progress_percent": round(max(0.0, min(100.0, current / target * 100)) if target else 0.0, 1),
        })

    return {
        "year": year,
        "month": month,
        "currency": main_currency,
        "actual_total": round(actual_total, 2),
        "planned_total": round(planned_total, 2),
        "remaining_plan": round(planned_total, 2),
        "projected_total": round(actual_total + planned_total, 2),
        "income_total": round(actual_income, 2),
        "expense_total": round(actual_expenses, 2),
        "net_total": round(actual_income - actual_expenses, 2),
        "planned_income_total": round(planned_income, 2),
        "comparison": {
            "previous_income": round(previous_income, 2),
            "previous_expenses": round(previous_expenses, 2),
            "income_change": _change(actual_income, previous_income),
            "expense_change": _change(actual_expenses, previous_expenses),
        },
        "budget": {
            "count": len(budgets),
            "plan": round(budget_plan, 2),
            "fact": round(actual_expenses, 2),
            "remaining": round(budget_plan - actual_expenses, 2),
        },
        "forecast": {
            "is_current_period": is_current_period,
            "days_elapsed": days_elapsed,
            "days_remaining": days_remaining,
            "average_daily_expenses": round(average_daily_expenses, 2),
            "predicted_expenses": round(predicted_expenses, 2),
            "predicted_income": round(predicted_income, 2),
            "predicted_net": round(predicted_net, 2),
            "budget_risks": budget_risks[:5],
            "upcoming": upcoming[:5],
        },
        "members": member_rows,
        "categories": category_rows,
        "settlements": settlement_rows,
        "settlements_total": round(settlements_total, 2),
        "notable_expenses": notable_expenses[:5],
        "goals": goal_rows,
        "month_summary": month_summary,
        "skipped_currencies": sorted(skipped_currencies),
    }


@router.get("/analytics")
def family_analytics(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
):
    return _family_analytics_data(year, month, db, user_id)


@router.get("/analytics/pdf")
def download_family_analytics_pdf(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
):
    membership = require_membership(db, user_id)
    family = db.query(Family).filter(Family.id == membership.family_id).first()
    data = _family_analytics_data(year, month, db, user_id)
    filename = f"casemoney-family-{year}-{month:02d}.pdf"
    return Response(
        content=build_family_report_pdf(data, family.name if family else "Семья"),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/analytics/email")
def email_family_analytics(
    payload: FamilyAnalyticsExportRequest,
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
):
    membership = require_membership(db, user_id)
    family = db.query(Family).filter(Family.id == membership.family_id).first()
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    data = _family_analytics_data(payload.year, payload.month, db, user_id)
    family_name = family.name if family else "Семья"
    period = report_period_label(payload.year, payload.month)
    sent = send_email(
        user.email,
        f"CaseMoney — семейный отчёт за {period}",
        f"Семейный отчёт «{family_name}» за {period}: доходы {data['income_total']:.0f}, расходы {data['expense_total']:.0f} {data['currency']}.",
        build_family_report_email_html(data, family_name),
    )
    if not sent:
        raise HTTPException(status_code=502, detail="Не удалось отправить отчёт. Проверьте настройки почты и попробуйте позже.")
    return {"sent": True, "email": user.email}


@router.get("/recurring-suggestions")
def family_recurring_suggestions(
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
):
    """Suggest, but never automatically create, recurring common payments."""
    membership = require_membership(db, user_id)
    return {
        "items": find_family_recurring_suggestions(db, membership.family_id, user_id),
    }


def _family_recurring_suggestion_or_404(
    db: Session, family_id: int, user_id: int, fingerprint: str,
) -> dict:
    for item in find_family_recurring_suggestions(
        db, family_id, user_id, include_resolved=True,
    ):
        if item["fingerprint"] == fingerprint:
            return item
    raise HTTPException(status_code=404, detail="Предложение регулярного платежа не найдено")


@router.post("/recurring-suggestions/{fingerprint}/dismiss", status_code=201)
def dismiss_family_recurring_suggestion(
    fingerprint: str,
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
):
    membership = require_membership(db, user_id)
    _family_recurring_suggestion_or_404(db, membership.family_id, user_id, fingerprint)
    existing = db.query(FamilyRecurringSuggestionDecision).filter(
        FamilyRecurringSuggestionDecision.family_id == membership.family_id,
        FamilyRecurringSuggestionDecision.fingerprint == fingerprint,
    ).first()
    if existing:
        return {"status": existing.status}
    db.add(FamilyRecurringSuggestionDecision(
        family_id=membership.family_id,
        fingerprint=fingerprint,
        status="dismissed",
        decided_by_user_id=user_id,
    ))
    db.commit()
    return {"status": "dismissed"}


@router.post("/recurring-suggestions/{fingerprint}/create-recurring", status_code=201)
def create_family_recurring_suggestion(
    fingerprint: str,
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
):
    membership = require_membership(db, user_id)
    suggestion = _family_recurring_suggestion_or_404(db, membership.family_id, user_id, fingerprint)
    if not suggestion["can_create"]:
        raise HTTPException(
            status_code=403,
            detail="Регулярную операцию может создать участник, с чьего счёта проходили эти расходы",
        )
    existing = db.query(FamilyRecurringSuggestionDecision).filter(
        FamilyRecurringSuggestionDecision.family_id == membership.family_id,
        FamilyRecurringSuggestionDecision.fingerprint == fingerprint,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Это предложение уже обработано")

    schedule = RecurringTransaction(
        user_id=user_id,
        name=suggestion["description"][:120],
        type=TransactionType.expense,
        amount=suggestion["amount"],
        currency=suggestion["currency"],
        account_id=suggestion["account_id"],
        category_id=suggestion["category_id"],
        description=suggestion["description"],
        frequency=suggestion["frequency"],
        next_date=suggestion["next_date"],
        family_id=membership.family_id,
        is_family_expense=True,
        reimbursement_amount=suggestion["reimbursement_amount"],
        suggestion_fingerprint=fingerprint,
    )
    db.add(schedule)
    db.add(FamilyRecurringSuggestionDecision(
        family_id=membership.family_id,
        fingerprint=fingerprint,
        status="created",
        decided_by_user_id=user_id,
    ))
    user = db.query(User).filter(User.id == user_id).first()
    if user:
        notify_user(
            db, user, event="planned_operation",
            title="Создан регулярный общий платёж",
            message=f"«{suggestion['description']}» будет добавляться в план {suggestion['frequency_label']}.",
            link="/planning",
        )
    db.commit()
    db.refresh(schedule)
    return {"id": schedule.id, "status": "created"}


@router.post("/settlements", status_code=201)
def create_settlement(
    data: SettlementCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
):
    membership = require_membership(db, user_id)
    if membership.role == "viewer":
        raise HTTPException(status_code=403, detail="Наблюдатель не может создавать возмещения")
    # Владелец возвращает деньги одной настоящей операцией: его счёт
    # уменьшается, счёт участника увеличивается. Это перевод, а не второй
    # расход — общая покупка уже вошла в аналитику при подтверждении.
    if membership.role != "owner":
        raise HTTPException(status_code=403, detail="Возмещение фиксирует владелец семейного пространства")
    recipient = db.query(FamilyMember).filter(
        FamilyMember.family_id == membership.family_id,
        FamilyMember.user_id == data.to_user_id,
        FamilyMember.status == "active",
    ).first()
    if not recipient:
        raise HTTPException(status_code=404, detail="Участник семьи не найден")
    if data.to_user_id == user_id:
        raise HTTPException(status_code=400, detail="Нельзя возместить самому себе")
    source_account = db.query(Account).filter(
        Account.id == data.from_account_id,
        Account.user_id == user_id,
    ).first()
    destination_account = db.query(Account).filter(
        Account.id == data.to_account_id,
        Account.user_id == data.to_user_id,
    ).first()
    if not source_account or not destination_account:
        raise HTTPException(status_code=400, detail="Выберите свой счёт и счёт получателя")
    currency = data.currency.upper()
    source_currencies = {balance.currency.upper() for balance in source_account.balances}
    destination_currencies = {balance.currency.upper() for balance in destination_account.balances}
    if currency not in source_currencies or currency not in destination_currencies:
        raise HTTPException(status_code=400, detail="Оба счёта должны поддерживать валюту возмещения")
    accepted_rows = _accounting_rows_query(db, membership.family_id).filter(
        FamilyExpenseAccounting.status == "accepted",
        FamilyExpenseAccounting.source_user_id == data.to_user_id,
    ).all()
    accepted_ids = [item.source_transaction_id for item in accepted_rows]
    owed = 0.0
    if accepted_ids:
        owed = float(
            db.query(func.coalesce(func.sum(Transaction.reimbursement_amount), 0))
            .filter(
                Transaction.id.in_(accepted_ids),
                Transaction.currency == currency,
            )
            .scalar()
            or 0
        )
    reimbursed = db.query(func.coalesce(func.sum(FamilySettlement.amount), 0)).filter(
        FamilySettlement.family_id == membership.family_id,
        FamilySettlement.to_user_id == data.to_user_id,
        FamilySettlement.currency == currency,
    ).scalar() or 0
    if data.amount > float(owed) - float(reimbursed) + 0.005:
        raise HTTPException(status_code=400, detail="Сумма больше подтверждённого долга к возмещению")
    settlement = FamilySettlement(
        family_id=membership.family_id,
        from_user_id=user_id,
        to_user_id=data.to_user_id,
        amount=data.amount,
        currency=currency,
        date=data.date or datetime.now(timezone.utc),
        description=data.description,
        created_by_user_id=user_id,
        from_account_id=source_account.id,
        to_account_id=destination_account.id,
    )
    db.add(settlement)
    db.flush()
    # Import locally to avoid exposing this specialised cross-family transfer
    # through the normal generic transfer form.
    from app.api.transactions import _apply_tx_effect, _write_history
    transfer = Transaction(
        amount=data.amount,
        currency=currency,
        type=TransactionType.transfer,
        description=data.description or "Возмещение семейных расходов",
        date=settlement.date,
        account_id=source_account.id,
        to_account_id=destination_account.id,
        to_amount=data.amount,
        to_currency=currency,
        user_id=user_id,
    )
    db.add(transfer)
    db.flush()
    exchange_svc.snapshot_transaction_rates(db, user_id, transfer)
    _apply_tx_effect(db, transfer)
    _write_history(db, user_id, transfer, "created")
    settlement.transaction_id = transfer.id
    sender = db.query(User).filter(User.id == user_id).first()
    sender_name = sender.username if sender and sender.username else "Участник семьи"
    notify_family_members(
        db,
        family_id=membership.family_id,
        actor_user_id=user_id,
        recipient_ids={data.to_user_id},
        event="family_reimbursement",
        title="Отмечено семейное возмещение",
        message=(
            f"{sender_name} отметил(а) возмещение "
            f"{data.amount:.2f} {data.currency.upper()}."
        ),
        link="/settings/family",
    )
    db.commit()
    db.refresh(settlement)
    return {"id": settlement.id}
