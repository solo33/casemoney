import calendar
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from app.models.billing import BillingPayment, Subscription
from app.models.notification import Notification
from app.models.user import User
from app.services import yookassa


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def add_month(value: datetime) -> datetime:
    year = value.year + (1 if value.month == 12 else 0)
    month = 1 if value.month == 12 else value.month + 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return value.replace(year=year, month=month, day=day)


def get_or_create_subscription(db: Session, user_id: int) -> Subscription:
    subscription = db.query(Subscription).filter(Subscription.user_id == user_id).first()
    if subscription:
        return subscription
    subscription = Subscription(user_id=user_id, plan="family", status="pending")
    db.add(subscription)
    db.flush()
    return subscription


def apply_provider_payment(db: Session, provider_data: dict) -> BillingPayment:
    provider_id = provider_data.get("id")
    payment = db.query(BillingPayment).filter(BillingPayment.provider_payment_id == provider_id).first()
    if not payment:
        raise ValueError("Неизвестный платёж")
    amount = provider_data.get("amount") or {}
    if amount.get("currency") != payment.currency or Decimal(str(amount.get("value"))) != payment.amount:
        raise ValueError("Сумма платежа не совпадает")

    status = provider_data.get("status", "pending")
    payment.status = status
    payment.failure_reason = (provider_data.get("cancellation_details") or {}).get("reason")
    subscription = payment.subscription
    user = db.query(User).filter(User.id == payment.user_id).first()
    if status == "succeeded" and payment.paid_at is None:
        now = utcnow()
        payment.paid_at = now
        method = provider_data.get("payment_method") or {}
        if method.get("saved") and method.get("id"):
            subscription.provider_payment_method_id = method["id"]
            card = method.get("card") or {}
            subscription.payment_method_title = (
                f"Карта •••• {card.get('last4')}" if card.get("last4") else method.get("title")
            )
        start = subscription.current_period_end if subscription.current_period_end and subscription.current_period_end > now else now
        subscription.status = "active"
        subscription.current_period_start = start
        subscription.current_period_end = add_month(start)
        subscription.next_charge_at = subscription.current_period_end
        subscription.last_payment_at = now
        if user:
            user.plan = "family"
            user.plan_source = "billing"
            user.plan_expires_at = subscription.current_period_end
            db.add(Notification(
                user_id=user.id,
                title="Family активирован",
                message=f"Подписка действует до {subscription.current_period_end.strftime('%d.%m.%Y')}.",
                link="/settings/billing",
            ))
    elif status == "canceled":
        subscription.status = "past_due" if subscription.current_period_end else "canceled"
    db.commit()
    db.refresh(payment)
    return payment


def process_subscription_renewals(db: Session) -> tuple[int, int]:
    now = utcnow()
    renewed = expired = 0
    subscriptions = db.query(Subscription).filter(Subscription.status.in_(["active", "past_due"])).all()
    for subscription in subscriptions:
        end = subscription.current_period_end
        if end and end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        if not end or end > now:
            continue
        user = db.query(User).filter(User.id == subscription.user_id).first()
        if subscription.cancel_at_period_end or not subscription.provider_payment_method_id:
            subscription.status = "canceled"
            if user and user.plan_source == "billing":
                user.plan, user.plan_source, user.plan_expires_at = "personal", "default", None
                db.add(Notification(user_id=user.id, title="Подписка Family завершена", message="Аккаунт переведён на Personal.", link="/settings/billing"))
            expired += 1
            continue
        pending = db.query(BillingPayment).filter(
            BillingPayment.subscription_id == subscription.id,
            BillingPayment.kind == "renewal",
            BillingPayment.status == "pending",
        ).first()
        if pending:
            continue
        key = yookassa.new_idempotence_key()
        payment = BillingPayment(user_id=subscription.user_id, subscription_id=subscription.id, idempotence_key=key,
                                 kind="renewal", amount=yookassa.family_price(), currency="RUB")
        db.add(payment)
        db.commit()
        try:
            provider = yookassa.create_recurring_payment(
                amount=payment.amount, payment_method_id=subscription.provider_payment_method_id,
                metadata={"payment_id": str(payment.id), "user_id": str(subscription.user_id)}, idempotence_key=key,
            )
            payment.provider_payment_id = provider["id"]
            db.commit()
            apply_provider_payment(db, provider)
            renewed += provider.get("status") == "succeeded"
        except yookassa.YooKassaError:
            db.rollback()
            payment = db.query(BillingPayment).filter(BillingPayment.id == payment.id).first()
            if payment:
                payment.status = "canceled"
                payment.failure_reason = "renewal_request_failed"
            subscription.status = "past_due"
    db.commit()
    return renewed, expired
