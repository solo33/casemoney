"""Bounded AI financial helper backed by DeepSeek.

There is deliberately no free-text prompt. The API derives a small aggregate
snapshot from the authenticated user's own data and asks the model only one of
a few fixed finance scenarios. It never sends transaction descriptions,
counterparties, account names, email addresses, or credentials.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.ai_usage import AiUsage
from app.models.category import Category
from app.models.transaction import Transaction, TransactionType
from app.models.user import User
from app.services import accounts as accounts_svc
from app.services.finance_period import financial_period_totals
from app.services.auth import decode_token
from app.services.plans import ensure_family_plan


router = APIRouter(prefix="/api/finance-ai", tags=["finance ai"])
security = HTTPBearer()
MONTHLY_LIMIT = max(1, int(os.getenv("DEEPSEEK_FINANCE_MONTHLY_LIMIT", "30")))
MIN_REQUEST_SECONDS = max(0, int(os.getenv("DEEPSEEK_FINANCE_MIN_INTERVAL_SECONDS", "15")))


def _user_id(credentials: HTTPAuthorizationCredentials = Depends(security)) -> int:
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    return int(payload["sub"])


class FinanceAiRequest(BaseModel):
    scenario: Literal["monthly_overview", "spending_anomalies", "budget_tips"]
    period_days: Literal[30, 90] = 30


class FinanceAiResponse(BaseModel):
    scenario: str
    period_days: int
    currency: str
    recommendations: list[str]
    source_note: str
    remaining_requests: int


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


@router.post("/insight", response_model=FinanceAiResponse)
async def finance_ai_insight(
    data: FinanceAiRequest,
    db: Session = Depends(get_db),
    user_id: int = Depends(_user_id),
):
    ensure_family_plan(db, user_id)
    api_key = os.getenv("DEEPSEEK_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="Финансовый помощник временно не настроен.")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    now = datetime.now(timezone.utc)
    period_key = now.strftime("%Y-%m")
    usage = db.query(AiUsage).filter(AiUsage.user_id == user_id, AiUsage.period_key == period_key).first()
    if usage and usage.request_count >= MONTHLY_LIMIT:
        raise HTTPException(status_code=429, detail="Лимит финансовых подсказок на этот месяц исчерпан.")
    if usage and usage.last_requested_at:
        last_requested_at = usage.last_requested_at
        # PostgreSQL returns an aware timestamp, while a local SQLite test
        # database may return a naive one. Treat a naive value as UTC so the
        # same per-user cooldown works in both environments.
        if last_requested_at.tzinfo is None:
            last_requested_at = last_requested_at.replace(tzinfo=timezone.utc)
        if (now - last_requested_at).total_seconds() < MIN_REQUEST_SECONDS:
            raise HTTPException(status_code=429, detail="Подождите несколько секунд перед следующей подсказкой.")

    currency, snapshot = _aggregate_snapshot(db, user_id, data.period_days)
    try:
        async with httpx.AsyncClient(timeout=25) as client:
            response = await client.post(
                "https://api.deepseek.com/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={"model": os.getenv("DEEPSEEK_FINANCE_MODEL", "deepseek-chat"), "temperature": 0.2, "max_tokens": 420, "messages": _prompt(data.scenario, currency, snapshot)},
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"].strip()
        parsed = json.loads(content.removeprefix("```json").removesuffix("```").strip())
        recommendations = [str(item).strip() for item in parsed.get("recommendations", []) if str(item).strip()][:3]
        if not recommendations:
            raise ValueError("empty recommendations")
    except Exception:
        raise HTTPException(status_code=502, detail="Не удалось подготовить финансовую подсказку. Попробуйте позже.")

    if not usage:
        usage = AiUsage(user_id=user_id, period_key=period_key, request_count=0)
        db.add(usage)
    usage.request_count += 1
    usage.last_requested_at = now
    db.commit()
    return FinanceAiResponse(
        scenario=data.scenario,
        period_days=data.period_days,
        currency=currency,
        recommendations=recommendations,
        source_note=f"Подсказка построена по суммам и категориям за {data.period_days} дней; отдельные операции и названия счетов не передавались.",
        remaining_requests=max(0, MONTHLY_LIMIT - usage.request_count),
    )
