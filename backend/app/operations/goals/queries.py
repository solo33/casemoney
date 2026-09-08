"""Goals: queries. Callers supply resolved user and database session."""
from sqlalchemy.orm import Session
from app.models.goal import Goal
from app.models.user import User
from app.services import exchange as exchange_svc
from app.services.plans import ensure_family_plan
from app.operations.goals.common import _available_balance_in_main_currency, _membership, _serialize


def list_goals(include_archived: bool=False, db: Session=None, user_id: int=None):
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
