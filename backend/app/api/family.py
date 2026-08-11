from datetime import datetime, timezone
import html
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.account import Account
from app.models.category import Category
from app.models.family import Family, FamilyMember, FamilySettlement
from app.models.notification import Notification
from app.models.transaction import Transaction, TransactionType
from app.models.user import User
from app.services.auth import decode_token
from app.services.email import app_url, send_email
from app.services.plans import ensure_family_plan
from app.services import accounts as accounts_svc
from app.services import exchange as exchange_svc

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
    invitation = FamilyMember(
        family_id=membership.family_id,
        user_id=user.id if user else None,
        email=email,
        role="member",
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


@router.get("/analytics")
def family_analytics(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
):
    """Monthly Family plan/fact report without exposing private account balances."""
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
        Transaction.type == TransactionType.expense,
        Transaction.date >= start,
        Transaction.date < end,
    ).all()
    category_names = dict(db.query(Category.id, Category.name).all())

    actual_total = 0.0
    planned_total = 0.0
    per_member: dict[int, float] = {}
    per_category: dict[str, float] = {}
    skipped_currencies: set[str] = set()

    for item in transactions:
        try:
            amount = exchange_svc.convert_for_user(
                db, item.user_id, item.amount, item.currency, main_currency,
            )
        except exchange_svc.ExchangeError:
            skipped_currencies.add(item.currency)
            continue
        if item.is_planned:
            planned_total += amount
            continue
        actual_total += amount
        per_member[item.user_id] = per_member.get(item.user_id, 0.0) + amount
        name = category_names.get(item.category_id, "Без категории")
        per_category[name] = per_category.get(name, 0.0) + amount

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
    return {
        "year": year,
        "month": month,
        "currency": main_currency,
        "actual_total": round(actual_total, 2),
        "planned_total": round(planned_total, 2),
        "remaining_plan": round(planned_total, 2),
        "projected_total": round(actual_total + planned_total, 2),
        "members": member_rows,
        "categories": category_rows,
        "skipped_currencies": sorted(skipped_currencies),
    }


@router.post("/settlements", status_code=201)
def create_settlement(
    data: SettlementCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
):
    membership = require_membership(db, user_id)
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
