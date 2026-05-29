from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi

from app.database import engine, Base
from app.models.user import User
from app.models.category import Category
from app.models.account import Account
from app.models.account_group import AccountGroup
from app.models.transaction import Transaction
from app.api.auth import router as auth_router
from app.api.accounts import router as accounts_router
from app.api.account_groups import router as account_groups_router
from app.api.categories import router as categories_router
from app.api.transactions import router as transactions_router
from app.api.dashboard import router as dashboard_router
from app.api.reports import router as reports_router

Base.metadata.create_all(bind=engine)

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