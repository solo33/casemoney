from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import os

# Явный путь к backend/.env — работает независимо от CWD uvicorn'а.
_ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(_ENV_PATH)

# Читаем адрес базы данных из .env
DATABASE_URL = os.getenv("DATABASE_URL")

# Создаём подключение к БД
engine = create_engine(DATABASE_URL)

# Фабрика сессий — каждый запрос получает свою сессию
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Базовый класс для всех моделей (таблиц)
Base = declarative_base()

# Функция которая выдаёт сессию БД для каждого запроса
def get_db():
    db = SessionLocal()
    try:
        yield db
        # Отчёты лениво фиксируют курс старых операций. Сохраняем все такие
        # снимки одним commit в конце успешного запроса, а не по одному на
        # каждую строку истории.
        if (
            db.info.pop("transaction_exchange_snapshots_dirty", False)
            or db.info.pop("exchange_rates_dirty", False)
        ):
            db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
