"""Admin: common. Callers supply resolved user and database session."""
from sqlalchemy.orm import Session
from app.models.user import User
from app.models.account import Account
from app.models.category import Category
from app.models.transaction import Transaction
from app.schemas.admin import AdminUserSummary, AdminConfig
from app.services.email import is_smtp_configured



def _summary(db: Session, u: User) -> AdminUserSummary:
    acc_count = db.query(Account).filter(Account.user_id == u.id).count()
    cat_count = db.query(Category).filter(Category.user_id == u.id).count()
    tx_count = db.query(Transaction).filter(Transaction.user_id == u.id).count()
    return AdminUserSummary(
        id=u.id,
        email=u.email,
        username=u.username,
        is_active=u.is_active,
        is_admin=u.is_admin,
        main_currency=u.main_currency,
        plan=u.plan,
        plan_source=u.plan_source,
        plan_expires_at=u.plan_expires_at,
        family_upgrade_enabled=u.family_upgrade_enabled,
        created_at=u.created_at,
        accounts_count=acc_count,
        categories_count=cat_count,
        transactions_count=tx_count,
    )


def _config_out(cfg) -> AdminConfig:
    return AdminConfig(
        require_email_verification=cfg.require_email_verification,
        smtp_configured=is_smtp_configured(),
        registration_enabled=cfg.registration_enabled,
        billing_enabled=cfg.billing_enabled,
    )
