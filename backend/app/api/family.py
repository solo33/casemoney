from calendar import monthrange
from datetime import datetime, timezone
import html
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.account import Account
from app.models.budget import Budget
from app.models.category import Category
from app.models.family import AccountFamilyAccess, Family, FamilyMember, FamilySettlement
from app.models.family_recurring_suggestion import FamilyRecurringSuggestionDecision
from app.models.notification import Notification
from app.models.recurring_transaction import RecurringTransaction
from app.models.transaction import Transaction, TransactionType
from app.models.user import User
from app.services.auth import decode_token
from app.services.email import app_url, send_email
from app.services.notifications import notify_user
from app.services.plans import ensure_family_plan
from app.services import accounts as accounts_svc
from app.services import app_config as app_config_svc
from app.services import exchange as exchange_svc
from app.services.family_recurring import find_family_recurring_suggestions

security = HTTPBearer()


def current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> int:
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    return int(payload["sub"])


def require_family_plan(
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
) -> None:
    ensure_family_plan(db, user_id)


router = APIRouter(
    prefix="/api/family",
    tags=["family"],
    dependencies=[Depends(require_family_plan)],
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
    amount: float = Field(gt=0)
    currency: str = Field(min_length=2, max_length=10)
    date: Optional[datetime] = None
    description: Optional[str] = Field(None, max_length=500)


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
    if user:
        db.add(Notification(
            user_id=user.id,
            title="Приглашение в семейное пространство",
            message=f"Вас пригласили в семейное пространство «{family_name}». Примите приглашение, чтобы участвовать в общих финансах.",
            link="/settings/family",
        ))
    db.commit()
    db.refresh(invitation)
    invite_url = f"{app_url()}/settings/family"
    safe_family_name = html.escape(family_name)
    safe_email = html.escape(email)
    safe_invite_url = html.escape(invite_url, quote=True)
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
    db.commit()
    family = db.query(Family).filter(Family.id == invitation.family_id).first()
    return family_payload(db, family, user_id)


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
    expenses = db.query(Transaction).filter(
        Transaction.family_id == membership.family_id,
        Transaction.is_family_expense.is_(True),
        Transaction.type == TransactionType.expense,
    ).order_by(Transaction.date.desc(), Transaction.id.desc()).all()
    settlements = db.query(FamilySettlement).filter(
        FamilySettlement.family_id == membership.family_id
    ).order_by(FamilySettlement.date.desc(), FamilySettlement.id.desc()).all()

    account_ids = {item.account_id for item in expenses}
    category_ids = {item.category_id for item in expenses if item.category_id}
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
                "category_name": category_names.get(item.category_id),
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


@router.get("/analytics")
def family_analytics(
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

    transactions = db.query(Transaction).filter(
        Transaction.family_id == membership.family_id,
        Transaction.is_family_expense.is_(True),
        Transaction.date >= start,
        Transaction.date < end,
    ).all()
    previous_end = start
    previous_start = datetime(
        year - (month == 1), 12 if month == 1 else month - 1, 1, tzinfo=timezone.utc,
    )
    previous_transactions = db.query(Transaction).filter(
        Transaction.family_id == membership.family_id,
        Transaction.is_family_expense.is_(True),
        Transaction.date >= previous_start,
        Transaction.date < previous_end,
    ).all()
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
                name = category_names.get(item.category_id, "Без категории")
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
        name = category_names.get(item.category_id, "Без категории")
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
        "month_summary": month_summary,
        "skipped_currencies": sorted(skipped_currencies),
    }


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
    recipient = db.query(FamilyMember).filter(
        FamilyMember.family_id == membership.family_id,
        FamilyMember.user_id == data.to_user_id,
        FamilyMember.status == "active",
    ).first()
    if not recipient:
        raise HTTPException(status_code=404, detail="Участник семьи не найден")
    if data.to_user_id == user_id:
        raise HTTPException(status_code=400, detail="Нельзя возместить самому себе")
    settlement = FamilySettlement(
        family_id=membership.family_id,
        from_user_id=user_id,
        to_user_id=data.to_user_id,
        amount=data.amount,
        currency=data.currency.upper(),
        date=data.date or datetime.now(timezone.utc),
        description=data.description,
        created_by_user_id=user_id,
    )
    db.add(settlement)
    db.commit()
    db.refresh(settlement)
    return {"id": settlement.id}
