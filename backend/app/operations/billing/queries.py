"""Billing: queries. Callers supply resolved user and database session."""
from sqlalchemy.orm import Session
from app.models.billing import BillingPayment, Subscription
from app.models.user import User
from app.schemas.billing import BillingOverview, PlanResponse
from app.services import yookassa
from app.services import app_config as app_config_svc
from app.operations.billing.common import _test_price


def plans(user: User=None):
    return [
        PlanResponse(code="personal", name="Personal", price=0, current=user.plan == "personal"),
        PlanResponse(code="family", name="Family", price=float(yookassa.family_price()), period="month", current=user.plan == "family"),
    ]


def overview(db: Session=None, user: User=None):
    subscription = db.query(Subscription).filter(Subscription.user_id == user.id).first()
    payments = db.query(BillingPayment).filter(BillingPayment.user_id == user.id).order_by(BillingPayment.id.desc()).limit(50).all()
    return BillingOverview(
        configured=yookassa.billing_configured(), plan=user.plan, plan_source=user.plan_source,
        plan_expires_at=user.plan_expires_at, family_price=float(yookassa.family_price()), subscription=subscription,
        payments=payments, family_upgrade_enabled=user.family_upgrade_enabled,
        billing_enabled=app_config_svc.is_billing_enabled(db),
        test_month_price=float(_test_price("month")), test_year_price=float(_test_price("year")),
    )
