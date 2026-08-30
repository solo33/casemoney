"""Единый слой пользовательских уведомлений.

Никаких финансовых данных не уходит во внешний сервис без явного включения
email-канала для конкретного события. Системные сообщения остаются внутри
аккаунта и видны через колокольчик в шапке.
"""
from __future__ import annotations

from typing import Literal

from sqlalchemy.orm import Session

from app.models.family import FamilyMember
from app.models.notification import Notification
from app.models.user import User
from app.services.email import send_financial_notification
from app.services.web_push import send_web_pushes


Channel = Literal["in_app", "email", "push"]


NOTIFICATION_EVENTS = {
    "credit_due": {
        "label": "Платежи по обязательствам и поступления по депозитам",
        "description": "Напоминание о ближайшем или просроченном платеже.",
        "default": {"in_app": True, "email": True, "push": True},
    },
    "planned_operation": {
        "label": "Запланированные операции",
        "description": "Создана очередная операция из расписания.",
        "default": {"in_app": True, "email": True, "push": True},
    },
    "budget_limit": {
        "label": "Бюджеты",
        "description": "Приближение к лимиту или превышение бюджета.",
        "default": {"in_app": True, "email": False, "push": True},
    },
    "large_expense": {
        "label": "Крупные расходы",
        "description": "Расход заметно выше обычного уровня.",
        "default": {"in_app": True, "email": False, "push": True},
    },
    "family_expense": {
        "label": "Семейные расходы",
        "description": "Новая общая покупка другого участника семьи.",
        "default": {"in_app": True, "email": False, "push": True},
    },
    "family_invitation": {
        "label": "Приглашения в семью",
        "description": "Приглашение в семейное пространство и его принятие.",
        "default": {"in_app": True, "email": True, "push": True},
    },
    "family_reimbursement": {
        "label": "Семейные возмещения",
        "description": "Участник отметил компенсацию общего расхода.",
        "default": {"in_app": True, "email": False, "push": True},
    },
    "family_access": {
        "label": "Доступы семьи",
        "description": "Изменение роли участника или доступа к общему счёту.",
        "default": {"in_app": True, "email": False, "push": True},
    },
    "goal_progress": {
        "label": "Финансовые цели",
        "description": "Изменение общей цели или достижение этапа.",
        "default": {"in_app": True, "email": False, "push": True},
    },
    "subscription": {
        "label": "Подписка",
        "description": "Окончание пробного периода или изменение тарифа.",
        "default": {"in_app": True, "email": True, "push": True},
    },
}


def normalized_preferences(value: dict | None) -> dict[str, dict[str, bool]]:
    """Merge stored preferences with safe defaults and discard unknown data."""
    stored = value if isinstance(value, dict) else {}
    result: dict[str, dict[str, bool]] = {}
    for event, spec in NOTIFICATION_EVENTS.items():
        selected = stored.get(event) if isinstance(stored.get(event), dict) else {}
        defaults = spec["default"]
        result[event] = {
            "in_app": bool(selected.get("in_app", defaults["in_app"])),
            "email": bool(selected.get("email", defaults["email"])),
            "push": bool(selected.get("push", defaults["push"])),
        }
    return result


def is_enabled(user: User, event: str, channel: Channel) -> bool:
    if event not in NOTIFICATION_EVENTS:
        return False
    return normalized_preferences(user.notification_preferences).get(event, {}).get(channel, False)


def notify_user(
    db: Session,
    user: User,
    *,
    event: str,
    title: str,
    message: str,
    link: str | None = None,
) -> tuple[bool, bool]:
    """Queue an in-app notification and/or send its email counterpart.

    The caller owns deduplication and the transaction commit. This makes the
    function reusable from the scheduler and ordinary API requests.
    """
    sent_in_app = False
    sent_email = False
    if is_enabled(user, event, "in_app"):
        db.add(Notification(user_id=user.id, title=title, message=message, link=link))
        sent_in_app = True
    if is_enabled(user, event, "email"):
        sent_email = send_financial_notification(
            to_email=user.email,
            username=user.username,
            title=title,
            message=message,
            link=link,
        )
    if is_enabled(user, event, "push"):
        send_web_pushes(db, user, title=title, link=link)
    return sent_in_app, sent_email


def notify_family_members(
    db: Session,
    *,
    family_id: int,
    actor_user_id: int | None,
    event: str,
    title: str,
    message: str,
    link: str | None = None,
    recipient_ids: set[int] | None = None,
) -> int:
    """Notify selected active participants of a family action.

    The author is not alerted about their own action.  `recipient_ids` narrows
    the audience for access changes; otherwise every other active participant
    receives the event according to their own channel preferences.
    """
    member_query = db.query(FamilyMember.user_id).filter(
        FamilyMember.family_id == family_id,
        FamilyMember.status == "active",
        FamilyMember.user_id.isnot(None),
    )
    if recipient_ids is not None:
        if not recipient_ids:
            return 0
        member_query = member_query.filter(FamilyMember.user_id.in_(recipient_ids))
    user_ids = {item[0] for item in member_query.all()}
    if actor_user_id is not None:
        user_ids.discard(actor_user_id)
    if not user_ids:
        return 0
    users = db.query(User).filter(User.id.in_(user_ids), User.is_active.is_(True)).all()
    for user in users:
        notify_user(db, user, event=event, title=title, message=message, link=link)
    return len(users)


def send_email_copy(user: User, *, title: str, message: str, link: str | None = None) -> bool:
    """Send an already preference-checked email without creating a duplicate alert."""
    return send_financial_notification(
        to_email=user.email,
        username=user.username,
        title=title,
        message=message,
        link=link,
    )
