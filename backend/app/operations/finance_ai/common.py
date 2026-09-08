"""Finance_ai: common. Callers supply resolved user and database session."""
import json
import os
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.models.category import Category
from app.services import accounts as accounts_svc
from app.services.finance_period import financial_period_totals



MONTHLY_LIMIT = max(1, int(os.getenv("DEEPSEEK_FINANCE_MONTHLY_LIMIT", "30")))


MIN_REQUEST_SECONDS = max(0, int(os.getenv("DEEPSEEK_FINANCE_MIN_INTERVAL_SECONDS", "15")))


def _aggregate_snapshot(db: Session, user_id: int, period_days: int) -> tuple[str, dict]:
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=period_days)
    prev_start = start - timedelta(days=period_days)
    currency = accounts_svc.get_user_main_currency(db, user_id)
    current = financial_period_totals(
        db, user_id, start, now, currency, include_expense_categories=True,
    )
    previous = financial_period_totals(db, user_id, prev_start, start, currency)
    current_categories = current.expense_categories or {}
    ids = [category_id for category_id in current_categories if category_id is not None]
    names = dict(db.query(Category.id, Category.name).filter(Category.id.in_(ids)).all()) if ids else {}
    categories = [
        {"category": names.get(category_id, "Без категории"), "amount": round(amount)}
        for category_id, amount in sorted(current_categories.items(), key=lambda item: item[1], reverse=True)[:8]
    ]
    return currency, {
        "period_days": period_days,
        "income": round(current.income),
        "expense": round(current.expense),
        "net": round(current.income - current.expense),
        "previous_expense": round(previous.expense),
        "top_expense_categories": categories,
    }


def _prompt(scenario: str, currency: str, snapshot: dict) -> list[dict]:
    scenario_labels = {
        "monthly_overview": "Коротко объясни финансовую картину периода и 1–3 практических финансовых шага.",
        "spending_anomalies": "Найди только заметные изменения расходов относительно предыдущего периода и предложи спокойную проверку причин.",
        "budget_tips": "Дай максимум 3 осторожные идеи для бюджета на следующий период, только из сумм и категорий ниже.",
    }
    system = (
        "Ты финансовый помощник CaseMoney. Отвечай только по переданному агрегированному снимку. "
        "Не отвечай на общие вопросы, не проси личные данные, не давай инвестиционных/юридических/налоговых советов, "
        "не утверждай факты, которых нет во входных данных. Не предлагай автоматически менять операции. "
        "Ответ верни строго JSON-объектом: {\"recommendations\":[\"...\"]}. "
        "От 1 до 3 коротких пунктов, на русском языке, без markdown."
    )
    user = (
        f"Валюта: {currency}. Сценарий: {scenario_labels[scenario]}\n"
        f"Агрегированные данные: {json.dumps(snapshot, ensure_ascii=False)}"
    )
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]
