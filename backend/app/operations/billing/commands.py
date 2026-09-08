"""Billing: commands. Callers supply resolved user and database session."""
import os
from datetime import timedelta
from decimal import Decimal
from fastapi import HTTPException, Request
from sqlalchemy.orm import Session
from app.models.billing import BillingPayment, Subscription
from app.models.notification import Notification
from app.models.user import User
from app.schemas.billing import BillingActionResponse, CheckoutRequest, CheckoutResponse, TestFamilyCheckoutRequest
from app.services.billing import add_month, apply_provider_payment, get_or_create_subscription, utcnow
from app.services import yookassa
from app.services import app_config as app_config_svc
from app.operations.billing.common import _ensure_user_can_purchase_family, _test_price


def activate_test_family(data: TestFamilyCheckoutRequest, db: Session=None, user: User=None):
    if not app_config_svc.is_billing_enabled(db):
        raise HTTPException(status_code=409, detail="Во время бесплатного запуска Family доступен без оплаты")
    _ensure_user_can_purchase_family(db, user)
    if user.plan == "family":
        raise HTTPException(status_code=409, detail="Family уже активирован")
    if data.period == "trial" and not data.acknowledge_family_data_cleanup:
        raise HTTPException(status_code=400, detail="Подтвердите предупреждение о данных Family")
    if data.period in {"month", "year"} and not data.accept_test_payment:
        raise HTTPException(status_code=400, detail="Подтвердите тестовую оплату")

    now = utcnow()
    if data.period == "trial":
        period_end = now + timedelta(days=7)
        amount = Decimal("0")
        kind = "trial"
    elif data.period == "year":
        period_end = now
        for _ in range(12):
            period_end = add_month(period_end)
        amount = _test_price("year")
        kind = "test_year"
    else:
        period_end = add_month(now)
        amount = _test_price("month")
        kind = "test_month"

    subscription = get_or_create_subscription(db, user.id)
    subscription.provider = "test"
    subscription.status = "active"
    subscription.current_period_start = now
    subscription.current_period_end = period_end
    subscription.next_charge_at = None
    subscription.cancel_at_period_end = True
    subscription.provider_payment_method_id = None
    subscription.payment_method_title = "Тестовая оплата" if data.period != "trial" else None
    subscription.last_payment_at = now if data.period != "trial" else None
    payment = BillingPayment(
        user_id=user.id,
        subscription_id=subscription.id,
        provider="test",
        provider_payment_id=f"test-{user.id}-{int(now.timestamp())}",
        idempotence_key=yookassa.new_idempotence_key(),
        kind=kind,
        amount=amount,
        currency="RUB",
        status="succeeded",
        paid_at=now,
    )
    db.add(payment)
    user.plan = "family"
    user.plan_source = "billing"
    user.plan_expires_at = period_end
    db.add(Notification(
        user_id=user.id,
        title="Добро пожаловать в Family",
        message=(
            "Тестовый период активирован на 7 дней."
            if data.period == "trial"
            else f"Тестовая оплата подтверждена. Family действует до {period_end.strftime('%d.%m.%Y')}."
        ),
        link="/settings/family",
    ))
    db.commit()
    return BillingActionResponse(status="active")


def checkout(data: CheckoutRequest, db: Session=None, user: User=None):
    if not app_config_svc.is_billing_enabled(db):
        raise HTTPException(status_code=409, detail="Во время бесплатного запуска Family доступен без оплаты")
    _ensure_user_can_purchase_family(db, user)
    if not data.accept_recurring:
        raise HTTPException(status_code=400, detail="Подтвердите согласие на автоматическое продление")
    if not yookassa.billing_configured():
        raise HTTPException(status_code=503, detail="Оплата пока не настроена")
    existing = db.query(BillingPayment).filter(
        BillingPayment.user_id == user.id,
        BillingPayment.kind == "initial",
        BillingPayment.status == "pending",
        BillingPayment.confirmation_url.isnot(None),
    ).order_by(BillingPayment.id.desc()).first()
    if existing:
        return CheckoutResponse(payment_id=existing.id, confirmation_url=existing.confirmation_url)
    subscription = get_or_create_subscription(db, user.id)
    key = yookassa.new_idempotence_key()
    payment = BillingPayment(user_id=user.id, subscription_id=subscription.id, idempotence_key=key,
                             kind="initial", amount=yookassa.family_price(), currency="RUB")
    db.add(payment)
    db.commit()
    db.refresh(payment)
    try:
        provider = yookassa.create_initial_payment(
            amount=payment.amount, email=user.email,
            return_url=f"{os.getenv('APP_URL', 'http://localhost:5173').rstrip('/')}/settings/billing?payment=return",
            metadata={"payment_id": str(payment.id), "user_id": str(user.id)}, idempotence_key=key,
        )
    except yookassa.YooKassaError as exc:
        payment.status = "canceled"
        payment.failure_reason = str(exc)
        db.commit()
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    payment.provider_payment_id = provider["id"]
    payment.confirmation_url = (provider.get("confirmation") or {}).get("confirmation_url")
    db.commit()
    if not payment.confirmation_url:
        apply_provider_payment(db, provider)
        raise HTTPException(status_code=409, detail="Платёж не требует перехода или уже обработан")
    return CheckoutResponse(payment_id=payment.id, confirmation_url=payment.confirmation_url)


def refresh_payment(db: Session=None, user: User=None):
    payment = db.query(BillingPayment).filter(BillingPayment.user_id == user.id, BillingPayment.status == "pending").order_by(BillingPayment.id.desc()).first()
    if not payment or not payment.provider_payment_id:
        return BillingActionResponse(status="no_pending_payment")
    try:
        payment = apply_provider_payment(db, yookassa.get_payment(payment.provider_payment_id))
    except yookassa.YooKassaError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return BillingActionResponse(status=payment.status)


def cancel(db: Session=None, user: User=None):
    subscription = db.query(Subscription).filter(Subscription.user_id == user.id).first()
    if not subscription:
        raise HTTPException(status_code=404, detail="Подписка не найдена")
    subscription.cancel_at_period_end = True
    db.commit()
    return BillingActionResponse(status="cancel_at_period_end")


def resume(db: Session=None, user: User=None):
    subscription = db.query(Subscription).filter(Subscription.user_id == user.id).first()
    if not subscription or not subscription.provider_payment_method_id:
        raise HTTPException(status_code=400, detail="Сохранённый способ оплаты не найден")
    subscription.cancel_at_period_end = False
    db.commit()
    return BillingActionResponse(status="active")


async def yookassa_webhook(request: Request, db: Session=None):
    payload = await request.json()
    provider_id = ((payload.get("object") or {}).get("id"))
    if not provider_id:
        return {"ok": True}
    try:
        verified = yookassa.get_payment(provider_id)
        apply_provider_payment(db, verified)
    except ValueError:
        return {"ok": True}
    except yookassa.YooKassaError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"ok": True}
