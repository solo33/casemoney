from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base

# Явно импортируем каждую модель напрямую
from app.models.user import User
from app.models.category import Category
from app.models.account import Account
from app.models.transaction import Transaction
# Создаём таблицы в БД при старте
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="CaseMoney API",
    description="API для учёта домашних финансов",
    version="0.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"message": "CaseMoney API работает! 🎉"}