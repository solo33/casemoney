"""Safe delivery of browser push notifications.

The service is optional: without VAPID keys CaseMoney continues working with
in-app and email notifications.  Push payloads deliberately contain only a
short event title and a link, not financial details.
"""
from __future__ import annotations

import json
import logging
import os

from sqlalchemy.orm import Session

from app.models.push_subscription import PushSubscription
from app.models.user import User

log = logging.getLogger(__name__)


def vapid_public_key() -> str | None:
    value = os.getenv("VAPID_PUBLIC_KEY", "").strip()
    return value or None


def _vapid_private_key() -> str | None:
    value = os.getenv("VAPID_PRIVATE_KEY", "").strip()
    return value or None


def is_web_push_configured() -> bool:
    return bool(vapid_public_key() and _vapid_private_key())


def send_web_pushes(db: Session, user: User, *, title: str, link: str | None = None) -> int:
    """Deliver a compact push to every active device of a user.

    Expired endpoints are removed after a 404/410 response. Other provider
    errors are logged and do not affect the operation that created the alert.
    """
    if not is_web_push_configured():
        return 0
    try:
        from pywebpush import WebPushException, webpush
    except ImportError:
        log.warning("Web Push is configured, but pywebpush is not installed")
        return 0

    private_key = _vapid_private_key()
    claims = {"sub": os.getenv("VAPID_SUBJECT", "mailto:support@casemoney.ru").strip()}
    payload = json.dumps({
        "title": "CaseMoney",
        "body": title[:120],
        "url": link or "/home",
    }, ensure_ascii=False)
    sent = 0
    for subscription in db.query(PushSubscription).filter(PushSubscription.user_id == user.id).all():
        try:
            webpush(
                subscription_info={
                    "endpoint": subscription.endpoint,
                    "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
                },
                data=payload,
                vapid_private_key=private_key,
                vapid_claims=claims,
                timeout=5,
            )
            sent += 1
        except WebPushException as exc:
            status = getattr(getattr(exc, "response", None), "status_code", None)
            if status in (404, 410):
                db.delete(subscription)
            else:
                log.warning("Could not deliver web push to user %s: %s", user.id, exc)
        except Exception:
            log.exception("Unexpected web push error for user %s", user.id)
    return sent
