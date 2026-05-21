from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import os

# Загружаем переменные из файла .env
load_dotenv()

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
    finally:
        db.close()