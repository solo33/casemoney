import asyncio
import logging
import os
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import text
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

# Импорты моделей нужны для регистрации в Base.metadata (используется alembic).
# Схему БД меняем ТОЛЬКО через alembic, create_all больше не вызываем.
from app.models.user import User  # noqa: F401
from app.models.ai_usage import AiUsage  # noqa: F401
from app.models.category import Category  # noqa: F401
from app.models.category_rule import CategoryRule  # noqa: F401
from app.models.account import Account  # noqa: F401
from app.models.account_group import AccountGroup  # noqa: F401
from app.models.account_balance import AccountBalance  # noqa: F401
from app.models.transaction import Transaction  # noqa: F401
from app.models.exchange_rate import ExchangeRate  # noqa: F401
from app.models.user_currency import UserCurrency  # noqa: F401
from app.models.goal import Goal, GoalContribution  # noqa: F401
from app.models.app_config import AppConfig  # noqa: F401
from app.models.transaction_history import TransactionHistory  # noqa: F401
from app.models.bank_import_mapping import (  # noqa: F401
    BankAccountMapping,
    BankCategoryMapping,
)
from app.models.family import Family, FamilyMember, FamilySettlement  # noqa: F401
from app.models.notification import Notification  # noqa: F401
from app.models.push_subscription import PushSubscription  # noqa: F401
from app.models.credit import CreditObligation, CreditPayment  # noqa: F401
from app.models.billing import Subscription, BillingPayment  # noqa: F401
from app.models.shopping import ShoppingList, ShoppingItem  # noqa: F401
from app.models.transaction_template import TransactionTemplate  # noqa: F401
from app.models.recurring_transaction import RecurringTransaction, RecurringTransactionRun  # noqa: F401
from app.models.family_recurring_suggestion import FamilyRecurringSuggestionDecision  # noqa: F401
from app.models.budget import Budget  # noqa: F401
from app.api.auth import router as auth_router
from app.api.accounts import router as accounts_router
from app.api.account_groups import router as account_groups_router
from app.api.categories import router as categories_router
from app.api.transactions import router as transactions_router
from app.api.dashboard import router as dashboard_router
from app.api.reports import router as reports_router
from app.api.exchange import router as exchange_router
from app.api.me import router as me_router
from app.api.currencies import router as currencies_router
from app.api.import_csv import router as import_router
from app.api.export_csv import router as export_router
from app.api.goals import router as goals_router
from app.api.admin import router as admin_router
from app.api.support import router as support_router
from app.api.family import router as family_router
from app.api.notifications import router as notifications_router
from app.api.credits import router as credits_router
from app.api.billing import router as billing_router
from app.api.shopping import router as shopping_router
from app.api.transaction_templates import router as transaction_templates_router
from app.api.recurring_transactions import router as recurring_transactions_router
from app.api.chat import router as chat_router
from app.api.budgets import router as budgets_router
from app.api.calendar import router as calendar_router
from app.api.automation import router as automation_router
from app.api.finance_insights import router as finance_insights_router
from app.api.finance_ai import router as finance_ai_router
from app.database import SessionLocal
from app.seeds import seed_demo_user
from app.services.credit_reminders import process_credit_reminders
from app.services.billing import process_subscription_renewals
from app.services.demo_cleanup import cleanup_expired_demo_users
from app.services.recurring_transactions import process_recurring_transactions

log = logging.getLogger("casemoney.credit_reminders")

_ratelimit_enabled = os.getenv("RATELIMIT_ENABLED", "1") not in ("0", "false", "off")
limiter = Limiter(key_func=get_remote_address, default_limits=[], enabled=_ratelimit_enabled)

app = FastAPI(
    title="CaseMoney API",
    description="API для учёта домашних финансов",
    version="0.1.0",
    swagger_ui_parameters={"persistAuthorization": True},
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# Разрешённые источники для CORS. На проде задаём переменной окружения
# CORS_ORIGINS="https://app.example.com,https://www.example.com".
_default_origins = "http://localhost:5173,http://127.0.0.1:5173"
_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", _default_origins).split(",") if o.strip()]

# Локальная сеть (192.168.x.x / 10.x.x.x / 172.16-31.x.x) на любом порту —
# чтобы IP машины, который меняет DHCP роутера, не приходилось прописывать
# в CORS_ORIGINS вручную при каждом переподключении к сети.
_LAN_ORIGIN_REGEX = (
    r"^https?://(localhost|127\.0\.0\.1"
    r"|192\.168\.\d{1,3}\.\d{1,3}"
    r"|10(\.\d{1,3}){3}"
    r"|172\.(1[6-9]|2\d|3[0-1])(\.\d{1,3}){2})"
    r"(:\d+)?$"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_origin_regex=_LAN_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(accounts_router)
app.include_router(account_groups_router)
app.include_router(categories_router)
app.include_router(transactions_router)
app.include_router(dashboard_router)
app.include_router(reports_router)
app.include_router(exchange_router)
app.include_router(me_router)
app.include_router(currencies_router)
app.include_router(import_router)
app.include_router(export_router)
app.include_router(goals_router)
app.include_router(admin_router)
app.include_router(support_router)
app.include_router(family_router)
app.include_router(notifications_router)
app.include_router(credits_router)
app.include_router(billing_router)
app.include_router(shopping_router)
app.include_router(transaction_templates_router)
app.include_router(recurring_transactions_router)
app.include_router(chat_router)
app.include_router(budgets_router)
app.include_router(calendar_router)
app.include_router(automation_router)
app.include_router(finance_insights_router)
app.include_router(finance_ai_router)


@app.on_event("startup")
def seed_demo_data():
    # Статический test@test.com — только для локальной разработки. По
    # умолчанию выключен: держать в общей проде постоянно доступный на
    # запись аккаунт с публичным паролем не нужно — для публичного демо
    # есть изолированные одноразовые аккаунты (create_ephemeral_demo_user).
    if os.getenv("SEED_STATIC_DEMO", "0").lower() not in ("1", "true", "yes"):
        return
    db = SessionLocal()
    try:
        seed_demo_user(db)
    finally:
        db.close()

def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )
    schema["components"]["securitySchemes"] = {
        "BearerAuth": {
            "type": "http",
            "scheme": "bearer",
        }
    }
    schema["security"] = [{"BearerAuth": []}]
    app.openapi_schema = schema
    return app.openapi_schema

app.openapi = custom_openapi

@app.get("/health")
def health():
    """Healthcheck для хостинга/мониторинга."""
    return {"status": "ok"}


@app.get("/health/ready")
def readiness():
    """Проверяет, что приложение может выполнить запрос к PostgreSQL."""
    db = SessionLocal()
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ready"}
    except Exception:
        return JSONResponse(status_code=503, content={"status": "not_ready"})
    finally:
        db.close()


async def _credit_reminder_loop() -> None:
    interval = max(60, int(os.getenv("CREDIT_REMINDER_INTERVAL_SECONDS", "3600")))
    while True:
        db = SessionLocal()
        try:
            system_count, email_count = await asyncio.to_thread(process_credit_reminders, db)
            if system_count or email_count:
                log.info(
                    "Processed credit reminders: system=%s, email=%s",
                    system_count,
                    email_count,
                )
        except asyncio.CancelledError:
            raise
        except Exception:
            db.rollback()
            log.exception("Credit reminder worker failed")
        finally:
            db.close()
        await asyncio.sleep(interval)


async def _billing_loop() -> None:
    interval = max(300, int(os.getenv("BILLING_WORKER_INTERVAL_SECONDS", "3600")))
    while True:
        db = SessionLocal()
        try:
            renewed, expired = await asyncio.to_thread(process_subscription_renewals, db)
            if renewed or expired:
                log.info("Processed subscriptions: renewed=%s expired=%s", renewed, expired)
        except asyncio.CancelledError:
            raise
        except Exception:
            db.rollback()
            log.exception("Billing worker failed")
        finally:
            db.close()
        await asyncio.sleep(interval)


async def _recurring_transaction_loop() -> None:
    interval = max(300, int(os.getenv("RECURRING_TRANSACTION_INTERVAL_SECONDS", "3600")))
    while True:
        db = SessionLocal()
        try:
            generated = await asyncio.to_thread(process_recurring_transactions, db)
            if generated:
                log.info("Generated recurring planned operations: %s", generated)
        except asyncio.CancelledError:
            raise
        except Exception:
            db.rollback()
            log.exception("Recurring transaction worker failed")
        finally:
            db.close()
        await asyncio.sleep(interval)


async def _demo_cleanup_loop() -> None:
    interval = max(60, int(os.getenv("DEMO_CLEANUP_INTERVAL_SECONDS", "1800")))
    while True:
        db = SessionLocal()
        try:
            removed = await asyncio.to_thread(cleanup_expired_demo_users, db)
            if removed:
                log.info("Removed expired demo accounts: %s", removed)
        except asyncio.CancelledError:
            raise
        except Exception:
            db.rollback()
            log.exception("Demo cleanup worker failed")
        finally:
            db.close()
        await asyncio.sleep(interval)


@app.on_event("startup")
async def start_credit_reminder_worker():
    default_enabled = "0" if not _ratelimit_enabled else "1"
    enabled = os.getenv("CREDIT_REMINDER_WORKER_ENABLED", default_enabled).lower() not in (
        "0",
        "false",
        "off",
    )
    if enabled:
        app.state.credit_reminder_task = asyncio.create_task(_credit_reminder_loop())
    billing_enabled = os.getenv("BILLING_WORKER_ENABLED", default_enabled).lower() not in ("0", "false", "off")
    if billing_enabled:
        app.state.billing_task = asyncio.create_task(_billing_loop())
    recurring_enabled = os.getenv("RECURRING_TRANSACTION_WORKER_ENABLED", default_enabled).lower() not in ("0", "false", "off")
    if recurring_enabled:
        app.state.recurring_transaction_task = asyncio.create_task(_recurring_transaction_loop())
    # Очистка демо-аккаунтов нужна везде, где ими вообще пользуются
    # (включая локальную разработку) — не привязываем к _ratelimit_enabled.
    demo_cleanup_enabled = os.getenv("DEMO_CLEANUP_WORKER_ENABLED", "1").lower() not in ("0", "false", "off")
    if demo_cleanup_enabled:
        app.state.demo_cleanup_task = asyncio.create_task(_demo_cleanup_loop())


@app.on_event("shutdown")
async def stop_credit_reminder_worker():
    task = getattr(app.state, "credit_reminder_task", None)
    if task:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
    billing_task = getattr(app.state, "billing_task", None)
    if billing_task:
        billing_task.cancel()
        try:
            await billing_task
        except asyncio.CancelledError:
            pass
    recurring_task = getattr(app.state, "recurring_transaction_task", None)
    if recurring_task:
        recurring_task.cancel()
        try:
            await recurring_task
        except asyncio.CancelledError:
            pass
    demo_cleanup_task = getattr(app.state, "demo_cleanup_task", None)
    if demo_cleanup_task:
        demo_cleanup_task.cancel()
        try:
            await demo_cleanup_task
        except asyncio.CancelledError:
            pass


_STATIC_DIR = Path(os.getenv("STATIC_DIR", Path(__file__).resolve().parents[1] / "static"))
_STATIC_ROOT = _STATIC_DIR.resolve()


def _frontend_file(path: Path, *, immutable: bool = False):
    cache_control = "public, max-age=31536000, immutable" if immutable else "no-cache, max-age=0"
    return FileResponse(path, headers={"Cache-Control": cache_control})


@app.get("/", include_in_schema=False)
def root():
    index = _STATIC_DIR / "index.html"
    if index.is_file():
        return _frontend_file(index)
    return {"message": "CaseMoney API работает"}


@app.get("/{full_path:path}", include_in_schema=False)
def frontend_spa(full_path: str):
    """Отдаёт production frontend и index.html для маршрутов React Router."""
    if full_path == "api" or full_path.startswith("api/"):
        return JSONResponse(status_code=404, content={"detail": "Not Found"})

    requested = (_STATIC_DIR / full_path).resolve()
    if requested.is_relative_to(_STATIC_ROOT) and requested.is_file():
        return _frontend_file(requested, immutable=full_path.startswith("assets/"))

    # Public routes receive build-generated index files with route-specific
    # metadata and readable fallback content for search crawlers.
    route_index = requested / "index.html"
    if requested.is_relative_to(_STATIC_ROOT) and route_index.is_file():
        return _frontend_file(route_index)

    index = _STATIC_DIR / "index.html"
    if index.is_file():
        return _frontend_file(index)
    return JSONResponse(status_code=404, content={"detail": "Not Found"})
