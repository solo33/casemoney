from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date, datetime, timedelta, timezone

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
from app.services.notifications import notify_family_members

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


def _available_balance_in_main_currency(db: Session, user_id: int, main_currency: str) -> float:
    """Сумма учитываемых счетов пользователя в основной валюте.

    Это именно доступный общий остаток, а не размер конкретной цели. Он нужен
    для наглядного распределения денег между целями по заданному порядку.
    """
    accounts = db.query(Account).filter(
        Account.user_id == user_id,
        Account.include_in_balance.is_(True),
    ).all()
    total = 0.0
    for account in accounts:
        for balance in account.balances:
            try:
                total += exchange_svc.convert_for_user(
                    db, user_id, balance.balance, balance.currency, main_currency,
                )
            except exchange_svc.ExchangeError:
                # Неполученный курс не должен ломать список целей. Эта валюта
                # просто не участвует в оценке до следующего обновления курса.
                continue
    return round(max(0.0, total), 2)


def _serialize(
    db: Session,
    user_id: int,
    goal: Goal,
    *,
    priority_allocation_amount: float | None = None,
    priority_shortfall_amount: float | None = None,
) -> GoalResponse:
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
    weekly_contribution = None
    if goal.due_date and goal.due_date > date.today() and remaining:
        days_left = (goal.due_date - date.today()).days
        months = max(1, (goal.due_date.year - date.today().year) * 12 + goal.due_date.month - date.today().month)
        monthly_contribution = round(remaining / months, 2)
        weekly_contribution = round(remaining / max(1, days_left) * 7, 2)

    # Прогноз строится только по фактическим взносам, а не по балансу счёта:
    # счёт может использоваться одновременно для нескольких целей.
    forecast_date = None
    schedule_deviation_days = None
    if remaining and rows:
        first_contribution_at = min(item.created_at for item, _ in rows)
        if first_contribution_at:
            first_day = first_contribution_at.date()
            elapsed_days = max(1, (date.today() - first_day).days + 1)
            daily_pace = contribution_total / elapsed_days
            if daily_pace > 0:
                forecast_date = date.today() + timedelta(days=round(remaining / daily_pace))
                if goal.due_date:
                    schedule_deviation_days = (forecast_date - goal.due_date).days

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
        weekly_contribution=weekly_contribution,
        forecast_date=forecast_date,
        schedule_deviation_days=schedule_deviation_days,
        priority_allocation_amount=priority_allocation_amount,
        priority_shortfall_amount=priority_shortfall_amount,
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
    active_goals = [goal for goal in goals if not goal.is_archived]
    user = db.query(User).filter(User.id == user_id).first()
    main_currency = (user.main_currency if user else "RUB").upper()
    available_main = _available_balance_in_main_currency(db, user_id, main_currency)

    # Сначала сериализуем цели, чтобы получить фактический остаток каждой,
    # затем последовательно резервируем общий доступный остаток.
    serialized_active = [_serialize(db, user_id, goal) for goal in active_goals]
    allocation_by_id: dict[int, tuple[float | None, float | None]] = {}
    for item in serialized_active:
        try:
            remaining_main = exchange_svc.convert_for_user(
                db, user_id, item.remaining_amount, item.currency, main_currency,
            )
            allocation_main = min(available_main, remaining_main)
            allocation_amount = exchange_svc.convert_for_user(
                db, user_id, allocation_main, main_currency, item.currency,
            )
            allocation_amount = round(min(item.remaining_amount, allocation_amount), 2)
            shortfall = round(max(0.0, item.remaining_amount - allocation_amount), 2)
            available_main = round(max(0.0, available_main - allocation_main), 2)
            allocation_by_id[item.id] = (allocation_amount, shortfall)
        except exchange_svc.ExchangeError:
            allocation_by_id[item.id] = (None, None)

    return [
        _serialize(
            db,
            user_id,
            goal,
            priority_allocation_amount=allocation_by_id.get(goal.id, (None, None))[0],
            priority_shortfall_amount=allocation_by_id.get(goal.id, (None, None))[1],
        )
        for goal in goals
    ]


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
    if goal.family_id and update:
        user = db.query(User).filter(User.id == user_id).first()
        actor_name = user.username if user and user.username else "Участник семьи"
        notify_family_members(
            db,
            family_id=goal.family_id,
            actor_user_id=user_id,
            event="goal_progress",
            title="Изменена общая цель",
            message=f"{actor_name} изменил(а) параметры цели «{goal.name}».",
            link="/goals",
        )
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
    user = db.query(User).filter(User.id == user_id).first()
    actor_name = user.username if user and user.username else "Участник семьи"
    notify_family_members(
        db,
        family_id=goal.family_id,
        actor_user_id=user_id,
        event="goal_progress",
        title="Пополнение общей цели",
        message=f"{actor_name} добавил(а) {data.amount:.2f} {goal.currency} к цели «{goal.name}».",
        link="/goals",
    )
    db.commit()
    return _serialize(db, user_id, goal)
