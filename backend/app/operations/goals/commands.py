"""Goals: commands. Callers supply resolved user and database session."""
from app.application import ApplicationError
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from app.models.goal import Goal, GoalContribution
from app.models.user import User
from app.schemas.goal import GoalCreate, GoalUpdate
from app.services.plans import ensure_family_plan
from app.services.notifications import notify_family_members
from app.operations.goals.common import _membership, _serialize, _validate_account
from app.schemas.goals_views import ContributionCreate


def create_goal(data: GoalCreate, db: Session=None, user_id: int=None):
    ensure_family_plan(db, user_id)
    _validate_account(db, user_id, data.account_id)
    membership = _membership(db, user_id)
    if data.is_shared and not membership:
        raise ApplicationError(status_code=400, detail="Сначала создайте семейное пространство")
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


def update_goal(goal_id: int, data: GoalUpdate, db: Session=None, user_id: int=None):
    ensure_family_plan(db, user_id)
    goal = db.query(Goal).filter(Goal.id == goal_id, Goal.user_id == user_id).first()
    if not goal:
        raise ApplicationError(status_code=404, detail="Goal not found")

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


def delete_goal(goal_id: int, db: Session=None, user_id: int=None):
    ensure_family_plan(db, user_id)
    goal = db.query(Goal).filter(Goal.id == goal_id, Goal.user_id == user_id).first()
    if not goal:
        raise ApplicationError(status_code=404, detail="Goal not found")
    db.delete(goal)
    db.commit()


def archive_goal(goal_id: int, db: Session=None, user_id: int=None):
    ensure_family_plan(db, user_id)
    goal = db.query(Goal).filter(Goal.id == goal_id, Goal.user_id == user_id).first()
    if not goal:
        raise ApplicationError(status_code=404, detail="Goal not found")
    goal.is_archived = True
    goal.archived_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(goal)
    return _serialize(db, user_id, goal)


def restore_goal(goal_id: int, db: Session=None, user_id: int=None):
    ensure_family_plan(db, user_id)
    goal = db.query(Goal).filter(Goal.id == goal_id, Goal.user_id == user_id).first()
    if not goal:
        raise ApplicationError(status_code=404, detail="Goal not found")
    goal.is_archived = False
    goal.archived_at = None
    db.commit()
    db.refresh(goal)
    return _serialize(db, user_id, goal)


def add_contribution(goal_id: int, data: ContributionCreate, db: Session=None, user_id: int=None):
    ensure_family_plan(db, user_id)
    goal = db.query(Goal).filter(Goal.id == goal_id).first()
    membership = _membership(db, user_id)
    if not goal or not membership or goal.family_id != membership.family_id:
        raise ApplicationError(status_code=404, detail="Общая цель не найдена")
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
