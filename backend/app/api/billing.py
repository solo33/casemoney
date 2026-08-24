import os
from datetime import timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.billing import BillingPayment, Subscription
from app.models.notification import Notification
from app.models.user import User
from app.schemas.billing import (
    BillingActionResponse,
    BillingOverview,
    CheckoutRequest,
    CheckoutResponse,
    PlanResponse,
    TestFamilyCheckoutRequest,
)
from app.services.auth import decode_token
from app.services.billing import add_month, apply_provider_payment, get_or_create_subscription, utcnow
from app.services import yookassa
from app.services import app_config as app_config_svc
from app.models.family import FamilyMember


router = APIRouter(prefix="/api/billing", tags=["billing"])
security = HTTPBearer()


def _test_price(period: str) -> Decimal:
    variable = "FAMILY_TEST_YEAR_PRICE_RUB" if period == "year" else "FAMILY_TEST_MONTH_PRICE_RUB"
    default = "2990" if period == "year" else "299"
    try:
        return max(Decimal("0"), Decimal(os.getenv(variable, default))).quantize(Decimal("0.01"))
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Некорректно задана тестовая стоимость Family") from exc


def _ensure_user_can_purchase_family(db: Session, user: User) -> None:
    """Family оплачивает только владелец общего пространства."""
    membership = db.query(FamilyMember).filter(
        FamilyMember.user_id == user.id,
        FamilyMember.status == "active",
    ).first()
    if membership and membership.role != "owner":
        raise HTTPException(status_code=403, detail="Оплату Family оформляет владелец семейного пространства")


def current_user(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)) -> User:
    payload = decode_token(credentials.credentials)
    user = db.query(User).filter(User.id == int(payload["sub"])).first() if payload else None
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user


@router.get("/plans", response_model=list[PlanResponse])
def plans(user: User = Depends(current_user)):
    return [
        PlanResponse(code="personal", name="Personal", price=0, current=user.plan == "personal"),
        PlanResponse(code="family", name="Family", price=float(yookassa.family_price()), period="month", current=user.plan == "family"),
    ]


@router.get("/overview", response_model=BillingOverview)
def overview(db: Session = Depends(get_db), user: User = Depends(current_user)):
    subscription = db.query(Subscription).filter(Subscription.user_id == user.id).first()
    payments = db.query(BillingPayment).filter(BillingPayment.user_id == user.id).order_by(BillingPayment.id.desc()).limit(50).all()
    return BillingOverview(
        configured=yookassa.billing_configured(), plan=user.plan, plan_source=user.plan_source,
        plan_expires_at=user.plan_expires_at, family_price=float(yookassa.family_price()), subscription=subscription,
        payments=payments, family_upgrade_enabled=user.family_upgrade_enabled,
        billing_enabled=app_config_svc.is_billing_enabled(db),
        test_month_price=float(_test_price("month")), test_year_price=float(_test_price("year")),
    )


@router.post("/test-family", response_model=BillingActionResponse)
def activate_test_family(
    data: TestFamilyCheckoutRequest,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
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


@router.post("/checkout", response_model=CheckoutResponse)
def checkout(data: CheckoutRequest, db: Session = Depends(get_db), user: User = Depends(current_user)):
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


@router.post("/refresh", response_model=BillingActionResponse)
def refresh_payment(db: Session = Depends(get_db), user: User = Depends(current_user)):
    payment = db.query(BillingPayment).filter(BillingPayment.user_id == user.id, BillingPayment.status == "pending").order_by(BillingPayment.id.desc()).first()
    if not payment or not payment.provider_payment_id:
        return BillingActionResponse(status="no_pending_payment")
    try:
        payment = apply_provider_payment(db, yookassa.get_payment(payment.provider_payment_id))
    except yookassa.YooKassaError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return BillingActionResponse(status=payment.status)


@router.post("/cancel", response_model=BillingActionResponse)
def cancel(db: Session = Depends(get_db), user: User = Depends(current_user)):
    subscription = db.query(Subscription).filter(Subscription.user_id == user.id).first()
    if not subscription:
        raise HTTPException(status_code=404, detail="Подписка не найдена")
    subscription.cancel_at_period_end = True
    db.commit()
    return BillingActionResponse(status="cancel_at_period_end")


@router.post("/resume", response_model=BillingActionResponse)
def resume(db: Session = Depends(get_db), user: User = Depends(current_user)):
    subscription = db.query(Subscription).filter(Subscription.user_id == user.id).first()
    if not subscription or not subscription.provider_payment_method_id:
        raise HTTPException(status_code=400, detail="Сохранённый способ оплаты не найден")
    subscription.cancel_at_period_end = False
    db.commit()
    return BillingActionResponse(status="active")


@router.post("/webhook/yookassa", include_in_schema=False)
async def yookassa_webhook(request: Request, db: Session = Depends(get_db)):
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
