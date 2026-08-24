from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date, datetime, timezone

from app.database import get_db
from app.models.goal import Goal, GoalContribution
from app.models.account import Account
from app.models.family import FamilyMember
from app.models.user import User
from app.schemas.goal import GoalCreate, GoalUpdate, GoalResponse
from app.services.auth import decode_token
from app.services import accounts as accounts_svc
from app.services import exchange as exchange_svc
from app.services.plans import ensure_family_plan

router = APIRouter(prefix="/api/goals", tags=["goals"])
security = HTTPBearer()


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> int:
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    return int(payload["sub"])


def _membership(db: Session, user_id: int):
    return db.query(FamilyMember).filter(FamilyMember.user_id == user_id, FamilyMember.status == "active").first()


def _serialize(db: Session, user_id: int, goal: Goal) -> GoalResponse:
    """Считает прогресс. Если есть account_id — current = баланс счёта в валюте цели."""
    current = goal.current_amount
    account_name = None
    if goal.account_id:
        acc = db.query(Account).filter(
            Account.id == goal.account_id, Account.user_id == user_id,
        ).first()
        if acc:
            account_name = acc.name
            # Сумма всех балансов счёта в валюте цели
            total = 0.0
            for b in acc.balances:
                try:
                    total += exchange_svc.convert_for_user(
                        db, user_id, b.balance, b.currency, goal.currency,
                    )
                except exchange_svc.ExchangeError:
                    pass
            current = round(total, 2)

    rows = db.query(GoalContribution, User).join(User, User.id == GoalContribution.user_id).filter(GoalContribution.goal_id == goal.id).all()
    contributions = [{"id": item.id, "user_id": item.user_id, "name": user.username or user.email, "amount": item.amount, "date": item.created_at.isoformat()} for item, user in rows]
    contribution_total = round(sum(item[0].amount for item in rows), 2)
    current += contribution_total
    pct = 0.0
    if goal.target_amount > 0:
        pct = round(max(0, min(100, current / goal.target_amount * 100)), 1)

    remaining = round(max(0, goal.target_amount - current), 2)
    monthly_contribution = None
    if goal.due_date and goal.due_date > date.today() and remaining:
        months = max(1, (goal.due_date.year - date.today().year) * 12 + goal.due_date.month - date.today().month)
        monthly_contribution = round(remaining / months, 2)

    return GoalResponse(
        id=goal.id,
        name=goal.name,
        icon=goal.icon,
        target_amount=goal.target_amount,
        currency=goal.currency,
        current_amount=current,
        progress_percent=pct,
        account_id=goal.account_id,
        account_name=account_name,
        due_date=goal.due_date,
        sort_order=goal.sort_order,
        remaining_amount=remaining,
        monthly_contribution=monthly_contribution,
        family_id=goal.family_id,
        is_shared=goal.family_id is not None,
        contributions_total=contribution_total,
        contributions=contributions,
        is_archived=goal.is_archived,
        archived_at=goal.archived_at,
    )


@router.get("/", response_model=List[GoalResponse])
def list_goals(
    include_archived: bool = False,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    ensure_family_plan(db, user_id)
    membership = _membership(db, user_id)
    query = db.query(Goal).filter(
        (Goal.user_id == user_id) | (Goal.family_id == (membership.family_id if membership else -1))
    )
    if not include_archived:
        query = query.filter(Goal.is_archived.is_(False))
    goals = query.order_by(Goal.is_archived, Goal.sort_order, Goal.id).all()
    return [_serialize(db, user_id, g) for g in goals]


def _validate_account(db: Session, user_id: int, account_id: Optional[int]):
    if account_id is None:
        return
    acc = db.query(Account).filter(
        Account.id == account_id, Account.user_id == user_id,
    ).first()
    if not acc:
        raise HTTPException(status_code=400, detail="Account not found")


@router.post("/", response_model=GoalResponse, status_code=201)
def create_goal(
    data: GoalCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    ensure_family_plan(db, user_id)
    _validate_account(db, user_id, data.account_id)
    membership = _membership(db, user_id)
    if data.is_shared and not membership:
        raise HTTPException(status_code=400, detail="Сначала создайте семейное пространство")
    goal = Goal(
        user_id=user_id,
        name=data.name,
        icon=data.icon,
        target_amount=data.target_amount,
        currency=data.currency.upper(),
        current_amount=data.current_amount,
        account_id=data.account_id,
        due_date=data.due_date,
        sort_order=data.sort_order,
        family_id=membership.family_id if data.is_shared else None,
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return _serialize(db, user_id, goal)


@router.patch("/{goal_id}", response_model=GoalResponse)
def update_goal(
    goal_id: int,
    data: GoalUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    ensure_family_plan(db, user_id)
    goal = db.query(Goal).filter(Goal.id == goal_id, Goal.user_id == user_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    update = data.model_dump(exclude_unset=True)
    if "currency" in update and update["currency"]:
        update["currency"] = update["currency"].upper()
    if "account_id" in update:
        _validate_account(db, user_id, update["account_id"])

    for k, v in update.items():
        setattr(goal, k, v)
    db.commit()
    db.refresh(goal)
    return _serialize(db, user_id, goal)


@router.delete("/{goal_id}", status_code=204)
def delete_goal(
    goal_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    ensure_family_plan(db, user_id)
    goal = db.query(Goal).filter(Goal.id == goal_id, Goal.user_id == user_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    db.delete(goal)
    db.commit()


@router.post("/{goal_id}/archive", response_model=GoalResponse)
def archive_goal(
    goal_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    ensure_family_plan(db, user_id)
    goal = db.query(Goal).filter(Goal.id == goal_id, Goal.user_id == user_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    goal.is_archived = True
    goal.archived_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(goal)
    return _serialize(db, user_id, goal)


@router.post("/{goal_id}/restore", response_model=GoalResponse)
def restore_goal(
    goal_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    ensure_family_plan(db, user_id)
    goal = db.query(Goal).filter(Goal.id == goal_id, Goal.user_id == user_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    goal.is_archived = False
    goal.archived_at = None
    db.commit()
    db.refresh(goal)
    return _serialize(db, user_id, goal)


class ContributionCreate(BaseModel):
    amount: float = Field(gt=0)


@router.post("/{goal_id}/contributions", response_model=GoalResponse)
def add_contribution(goal_id: int, data: ContributionCreate, db: Session = Depends(get_db), user_id: int = Depends(get_current_user_id)):
    ensure_family_plan(db, user_id)
    goal = db.query(Goal).filter(Goal.id == goal_id).first()
    membership = _membership(db, user_id)
    if not goal or not membership or goal.family_id != membership.family_id:
        raise HTTPException(status_code=404, detail="Общая цель не найдена")
    db.add(GoalContribution(goal_id=goal.id, user_id=user_id, amount=data.amount))
    db.commit()
    return _serialize(db, user_id, goal)
