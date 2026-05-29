from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi

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

app = FastAPI(
    title="CaseMoney API",
    description="API для учёта домашних финансов",
    version="0.1.0",
    swagger_ui_parameters={"persistAuthorization": True},
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
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
    return {"message": "CaseMoney API работает! 🎉"}