"""Goals: common. Callers supply resolved user and database session."""
from app.application import ApplicationError
from sqlalchemy.orm import Session
from typing import Optional
from datetime import date, timedelta
from app.models.goal import Goal, GoalContribution
from app.models.account import Account
from app.models.family import FamilyMember
from app.models.user import User
from app.schemas.goal import GoalResponse
from app.services import exchange as exchange_svc



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
    total = 0
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
    return round(max(0, total), 2)


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
            total = 0
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
    pct = 0
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


def _validate_account(db: Session, user_id: int, account_id: Optional[int]):
    if account_id is None:
        return
    acc = db.query(Account).filter(
        Account.id == account_id, Account.user_id == user_id,
    ).first()
    if not acc:
        raise ApplicationError(status_code=400, detail="Account not found")
