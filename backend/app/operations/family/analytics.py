"""Family: analytics. Callers supply resolved user and database session."""
from calendar import monthrange
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional
from app.application import ApplicationError, ResponseData
from sqlalchemy.orm import Session
from app.models.account import Account
from app.models.budget import Budget
from app.models.category import Category
from app.models.family import Family, FamilyExpenseAccounting, FamilyMember, FamilySettlement
from app.models.goal import Goal, GoalContribution
from app.models.transaction import Transaction, TransactionType
from app.models.user import User
from app.services.email import send_email
from app.services import accounts as accounts_svc
from app.services import exchange as exchange_svc
from app.services.family_report import build_family_report_email_html, build_family_report_pdf, report_period_label
from app.services.family_context import accounting_rows_query, _filter_month, _user_label, require_membership
from app.schemas.family_views import FamilyAnalyticsExportRequest


def family_report(year: Optional[int]=None, month: Optional[int]=None, db: Session=None, user_id: int=None):
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
    accounting_rows = accounting_rows_query(db, membership.family_id).filter(
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

    # The month selector applies to spending, not to the outstanding debt:
    # reimbursements may cover purchases from several periods.
    if year is not None or month is not None:
        month_rows = _filter_month(db.query(Transaction).filter(
            Transaction.family_id == membership.family_id,
            Transaction.is_family_expense.is_(True),
            Transaction.is_planned.is_(False),
            Transaction.type == TransactionType.expense,
        ), year, month).all()
        totals = {}
        for tx in month_rows:
            totals[tx.currency] = round(totals.get(tx.currency, 0) + tx.amount, 2)
        month_ids = {tx.id for tx in month_rows}
        expenses = [tx for tx in expenses if tx.id in month_ids]

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


def _shared_goal_progress(db, family_id, start, end, main_currency, skipped_currencies):
    goal_rows = []
    shared_goals = db.query(Goal).filter(
        Goal.family_id == family_id,
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

    return goal_rows


def _period_settlements(db, family_id, user_id, start, end, main_currency, users, skipped_currencies):
    settlements = db.query(FamilySettlement).filter(
        FamilySettlement.family_id == family_id,
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

    return settlement_rows, settlements_total


def _month_summary(predicted_income, predicted_expenses, is_current_period, budget_risks, category_rows):
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
    return month_summary, predicted_net


@dataclass
class PeriodTotals:
    actual_expenses: float
    actual_income: float
    planned_expenses: float
    planned_income: float
    unaccounted_expenses: float
    unaccounted_expense_count: int
    per_member: dict[int, float]
    per_category: dict[str, float]
    planned_per_category: dict[str, float]
    skipped_currencies: set[str]
    notable_expenses: list[dict]
    converted_amounts: dict[int, float]
    previous_expenses: float
    previous_income: float


def _aggregate_period_transactions(db, main_currency, transactions, previous_transactions, accepted_by_tx_id, accounting_by_tx_id, category_names, users):
    actual_expenses = 0.0
    actual_income = 0.0
    planned_expenses = 0.0
    planned_income = 0.0
    unaccounted_expenses = 0.0
    unaccounted_expense_count = 0
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
        accounting = accounting_by_tx_id.get(item.id)
        is_accounted = bool(accounting and accounting.status == "accepted")
        # Pending purchases already participate in the household total and
        # member contribution. Their owner category is intentionally absent
        # until the owner confirms the mapping, so do not distort the budget
        # by guessing a category in the owner's taxonomy.
        if is_accounted:
            category_id = accounting.owner_category_id
            name = category_names.get(category_id, "Без категории")
            per_category[name] = per_category.get(name, 0.0) + amount
        else:
            category_id = item.category_id
            name = category_names.get(category_id, "Без категории")
            unaccounted_expenses += amount
            unaccounted_expense_count += 1
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

    return PeriodTotals(
        actual_expenses=actual_expenses,
        actual_income=actual_income,
        planned_expenses=planned_expenses,
        planned_income=planned_income,
        unaccounted_expenses=unaccounted_expenses,
        unaccounted_expense_count=unaccounted_expense_count,
        per_member=per_member,
        per_category=per_category,
        planned_per_category=planned_per_category,
        skipped_currencies=skipped_currencies,
        notable_expenses=notable_expenses,
        converted_amounts=converted_amounts,
        previous_expenses=previous_expenses,
        previous_income=previous_income,
    )


@dataclass
class PeriodForecast:
    budget_count: int
    budget_plan: float
    is_current_period: bool
    days_elapsed: int
    days_remaining: int
    average_daily_expenses: float
    predicted_expenses: float
    predicted_income: float
    budget_risks: list[dict]
    upcoming: list[dict]


def _period_forecast(db, user_id, year, month, start, end, main_currency, category_names, transactions, totals, now):
    budget_plan = 0.0
    budgets = db.query(Budget).filter(
        Budget.user_id == user_id,
        Budget.scope == "family",
        Budget.period == "month",
        Budget.period_start == start.date(),
    ).all()
    for item in budgets:
        converted = _convert_or_skip(db, user_id, item.amount, item.currency, main_currency, totals.skipped_currencies)
        if converted is not None:
            budget_plan += converted

    is_current_period = now.year == year and now.month == month
    total_days = monthrange(year, month)[1]
    days_elapsed = now.day if is_current_period else total_days if now > end else 0
    days_remaining = total_days - days_elapsed if is_current_period else 0
    average_daily_expenses = totals.actual_expenses / days_elapsed if days_elapsed else 0.0
    predicted_expenses = totals.actual_expenses + totals.planned_expenses + average_daily_expenses * days_remaining
    predicted_income = totals.actual_income + totals.planned_income

    budget_risks = []
    for item in budgets:
        category_name = category_names.get(item.category_id)
        if not category_name:
            continue
        limit = _convert_or_skip(db, user_id, item.amount, item.currency, main_currency, totals.skipped_currencies)
        if limit is None:
            continue
        category_actual = totals.per_category.get(category_name, 0.0)
        category_planned = totals.planned_per_category.get(category_name, 0.0)
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
            amount = totals.converted_amounts.get(item.id)
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

    return PeriodForecast(
        budget_count=len(budgets),
        budget_plan=budget_plan,
        is_current_period=is_current_period,
        days_elapsed=days_elapsed,
        days_remaining=days_remaining,
        average_daily_expenses=average_daily_expenses,
        predicted_expenses=predicted_expenses,
        predicted_income=predicted_income,
        budget_risks=budget_risks,
        upcoming=upcoming,
    )


def _family_analytics_data(year: int, month: int, db: Session=None, user_id: int=None):
    """Monthly Family report without exposing private account balances.

    Only operations that a participant explicitly marked as family-related are
    included.  This keeps private accounts and personal spending out of the
    shared report while still making the household picture useful.
    """
    if month < 1 or month > 12:
        raise ApplicationError(status_code=422, detail="Месяц должен быть от 1 до 12")

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

    # The report is a view of the household's actual common spending, not
    # only of the purchases the owner has already categorised.  Acceptance is
    # still required for the owner's category analytics and reimbursements,
    # but it must not make the total household amount look like zero.
    accounting_rows = accounting_rows_query(db, membership.family_id).all()
    accepted_rows = [item for item in accounting_rows if item.status == "accepted"]
    accepted_by_tx_id = {item.source_transaction_id: item for item in accepted_rows}
    accepted_ids = list(accepted_by_tx_id)
    accounting_by_tx_id = {item.source_transaction_id: item for item in accounting_rows}
    accounting_ids = list(accounting_by_tx_id)
    actual_transactions = db.query(Transaction).filter(
        Transaction.id.in_(accounting_ids),
        Transaction.date >= start,
        Transaction.date < end,
    ).all() if accounting_ids else []
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
        Transaction.id.in_(accounting_ids),
        Transaction.date >= previous_start,
        Transaction.date < previous_end,
    ).all() if accounting_ids else []
    category_names = dict(db.query(Category.id, Category.name).all())

    totals = _aggregate_period_transactions(
        db, main_currency, transactions, previous_transactions, accepted_by_tx_id,
        accounting_by_tx_id, category_names, users,
    )

    settlement_rows, settlements_total = _period_settlements(db, membership.family_id, user_id, start, end, main_currency, users, totals.skipped_currencies)

    forecast = _period_forecast(
        db, user_id, year, month, start, end, main_currency, category_names,
        transactions, totals, datetime.now(timezone.utc),
    )

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
            "actual": round(totals.per_member.get(member.user_id, 0.0), 2),
        }
        for member in members
    ]
    category_rows = [
        {"name": name, "actual": round(amount, 2)}
        for name, amount in sorted(totals.per_category.items(), key=lambda pair: pair[1], reverse=True)
    ]
    totals.notable_expenses.sort(key=lambda item: item["amount"], reverse=True)
    actual_total = totals.actual_expenses
    planned_total = totals.planned_expenses
    month_summary, predicted_net = _month_summary(forecast.predicted_income, forecast.predicted_expenses, forecast.is_current_period, forecast.budget_risks, category_rows)

    goal_rows = _shared_goal_progress(db, membership.family_id, start, end, main_currency, totals.skipped_currencies)

    return {
        "year": year,
        "month": month,
        "currency": main_currency,
        "actual_total": round(actual_total, 2),
        "planned_total": round(planned_total, 2),
        "remaining_plan": round(planned_total, 2),
        "projected_total": round(actual_total + planned_total, 2),
        "income_total": round(totals.actual_income, 2),
        "expense_total": round(totals.actual_expenses, 2),
        "net_total": round(totals.actual_income - totals.actual_expenses, 2),
        "planned_income_total": round(totals.planned_income, 2),
        "unaccounted_expense_total": round(totals.unaccounted_expenses, 2),
        "unaccounted_expense_count": totals.unaccounted_expense_count,
        "comparison": {
            "previous_income": round(totals.previous_income, 2),
            "previous_expenses": round(totals.previous_expenses, 2),
            "income_change": _change(totals.actual_income, totals.previous_income),
            "expense_change": _change(totals.actual_expenses, totals.previous_expenses),
        },
        "budget": {
            "count": forecast.budget_count,
            "plan": round(forecast.budget_plan, 2),
            "fact": round(totals.actual_expenses, 2),
            "remaining": round(forecast.budget_plan - totals.actual_expenses, 2),
        },
        "forecast": {
            "is_current_period": forecast.is_current_period,
            "days_elapsed": forecast.days_elapsed,
            "days_remaining": forecast.days_remaining,
            "average_daily_expenses": round(forecast.average_daily_expenses, 2),
            "predicted_expenses": round(forecast.predicted_expenses, 2),
            "predicted_income": round(forecast.predicted_income, 2),
            "predicted_net": round(predicted_net, 2),
            "budget_risks": forecast.budget_risks[:5],
            "upcoming": forecast.upcoming[:5],
        },
        "members": member_rows,
        "categories": category_rows,
        "settlements": settlement_rows,
        "settlements_total": round(settlements_total, 2),
        "notable_expenses": totals.notable_expenses[:5],
        "goals": goal_rows,
        "month_summary": month_summary,
        "skipped_currencies": sorted(totals.skipped_currencies),
    }


def family_analytics(year: int, month: int, db: Session=None, user_id: int=None):
    return _family_analytics_data(year, month, db, user_id)


def download_family_analytics_pdf(year: int, month: int, db: Session=None, user_id: int=None):
    membership = require_membership(db, user_id)
    family = db.query(Family).filter(Family.id == membership.family_id).first()
    data = _family_analytics_data(year, month, db, user_id)
    filename = f"casemoney-family-{year}-{month:02d}.pdf"
    return ResponseData(
        content=build_family_report_pdf(data, family.name if family else "Семья"),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def email_family_analytics(payload: FamilyAnalyticsExportRequest, db: Session=None, user_id: int=None):
    membership = require_membership(db, user_id)
    family = db.query(Family).filter(Family.id == membership.family_id).first()
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise ApplicationError(status_code=404, detail="Пользователь не найден")
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
        raise ApplicationError(status_code=502, detail="Не удалось отправить отчёт. Проверьте настройки почты и попробуйте позже.")
    return {"sent": True, "email": user.email}
