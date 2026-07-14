import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

# Импорты моделей нужны для регистрации в Base.metadata (используется alembic).
# Схему БД меняем ТОЛЬКО через alembic, create_all больше не вызываем.
from app.models.user import User  # noqa: F401
from app.models.category import Category  # noqa: F401
from app.models.account import Account  # noqa: F401
from app.models.account_group import AccountGroup  # noqa: F401
from app.models.account_balance import AccountBalance  # noqa: F401
from app.models.transaction import Transaction  # noqa: F401
from app.models.exchange_rate import ExchangeRate  # noqa: F401
from app.models.user_currency import UserCurrency  # noqa: F401
from app.models.goal import Goal  # noqa: F401
from app.models.app_config import AppConfig  # noqa: F401
from app.models.transaction_history import TransactionHistory  # noqa: F401
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
from app.database import SessionLocal
from app.seeds import seed_demo_user

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


@app.on_event("startup")
def seed_demo_data():
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

@app.get("/")
def root():
    return {"message": "CaseMoney API работает"}


@app.get("/health")
def health():
    """Healthcheck для хостинга/мониторинга."""
    return {"status": "ok"}
