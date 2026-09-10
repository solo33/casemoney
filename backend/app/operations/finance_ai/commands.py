"""Finance_ai: commands. Callers supply resolved user and database session."""
from app.money import decimal
import json
import os
from datetime import datetime, timezone
import httpx
from app.application import ApplicationError
from sqlalchemy.orm import Session
from app.models.ai_usage import AiUsage
from app.models.user import User
from app.services.plans import ensure_family_plan
from app.operations.finance_ai.common import _aggregate_snapshot, _prompt, MIN_REQUEST_SECONDS, MONTHLY_LIMIT
from app.schemas.finance_ai_views import FinanceAiRequest, FinanceAiResponse


async def finance_ai_insight(data: FinanceAiRequest, db: Session=None, user_id: int=None):
    ensure_family_plan(db, user_id)
    api_key = os.getenv("DEEPSEEK_API_KEY", "").strip()
    if not api_key:
        raise ApplicationError(status_code=503, detail="Финансовый помощник временно не настроен.")
    user = db.query(User).filter(User.id == user_id).with_for_update().first()
    if not user:
        raise ApplicationError(status_code=404, detail="Пользователь не найден")
    now = datetime.now(timezone.utc)
    period_key = now.strftime("%Y-%m")
    usage = db.query(AiUsage).filter(AiUsage.user_id == user_id, AiUsage.period_key == period_key).first()
    if usage and usage.request_count >= MONTHLY_LIMIT:
        raise ApplicationError(status_code=429, detail="Лимит финансовых подсказок на этот месяц исчерпан.")
    if usage and usage.last_requested_at:
        last_requested_at = usage.last_requested_at
        # PostgreSQL returns an aware timestamp, while a local SQLite test
        # database may return a naive one. Treat a naive value as UTC so the
        # same per-user cooldown works in both environments.
        if last_requested_at.tzinfo is None:
            last_requested_at = last_requested_at.replace(tzinfo=timezone.utc)
        if (now - last_requested_at).total_seconds() < MIN_REQUEST_SECONDS:
            raise ApplicationError(status_code=429, detail="Подождите несколько секунд перед следующей подсказкой.")

    currency, snapshot = _aggregate_snapshot(db, user_id, data.period_days)
    # Reserve before awaiting the provider. A synchronous row lock held across
    # await could block the event loop when a second request acquires the lock.
    if not usage:
        usage = AiUsage(user_id=user_id, period_key=period_key, request_count=0)
        db.add(usage)
    usage.request_count += 1
    usage.last_requested_at = now
    remaining_requests = max(0, MONTHLY_LIMIT - usage.request_count)
    db.commit()
    try:
        async with httpx.AsyncClient(timeout=25) as client:
            response = await client.post(
                "https://api.deepseek.com/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={"model": os.getenv("DEEPSEEK_FINANCE_MODEL", "deepseek-chat"), "temperature": decimal('0.2'), "max_tokens": 420, "messages": _prompt(data.scenario, currency, snapshot)},
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"].strip()
        parsed = json.loads(content.removeprefix("```json").removesuffix("```").strip())
        recommendations = [str(item).strip() for item in parsed.get("recommendations", []) if str(item).strip()][:3]
        if not recommendations:
            raise ValueError("empty recommendations")
    except Exception:
        # Refund a failed attempt atomically; keep the cooldown against retry
        # storms and do not overwrite a later request's quota count.
        db.query(AiUsage).filter(
            AiUsage.user_id == user_id, AiUsage.period_key == period_key,
            AiUsage.request_count > 0,
        ).update({AiUsage.request_count: AiUsage.request_count - 1}, synchronize_session=False)
        db.commit()
        raise ApplicationError(status_code=502, detail="Не удалось подготовить финансовую подсказку. Попробуйте позже.")
    return FinanceAiResponse(
        scenario=data.scenario,
        period_days=data.period_days,
        currency=currency,
        recommendations=recommendations,
        source_note=f"Подсказка построена по суммам и категориям за {data.period_days} дней; отдельные операции и названия счетов не передавались.",
        remaining_requests=remaining_requests,
    )
