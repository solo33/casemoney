"""Тестовое окружение: in-memory SQLite + переопределение get_db.

ВАЖНО: переменные окружения задаются до импорта приложения, т.к.
app.services.auth и app.database читают их на этапе импорта.
"""
import os

os.environ.setdefault("SECRET_KEY", "test_" + "x" * 60)         # длинный валидный ключ
os.environ.setdefault("DATABASE_URL", "sqlite:///./_unused_test.db")  # перекрывается ниже
os.environ.setdefault("CORS_ORIGINS", "http://localhost:5173")

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from app.database import Base, get_db
import app.main as main_module

# Регистрируем все модели в Base.metadata (импорт ради side-effect)
import app.models.user            # noqa: F401
import app.models.category        # noqa: F401
import app.models.account         # noqa: F401
import app.models.account_group   # noqa: F401
import app.models.account_balance # noqa: F401
import app.models.transaction     # noqa: F401
import app.models.transaction_history  # noqa: F401
import app.models.exchange_rate   # noqa: F401
import app.models.user_currency   # noqa: F401
import app.models.goal            # noqa: F401
import app.models.app_config      # noqa: F401

test_engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(bind=test_engine, autoflush=False, autocommit=False)


def _override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def _fresh_db():
    """Чистая схема на каждый тест."""
    Base.metadata.create_all(bind=test_engine)
    main_module.app.dependency_overrides[get_db] = _override_get_db
    yield
    Base.metadata.drop_all(bind=test_engine)
    # сбрасываем кэш курсов между тестами
    try:
        from app.services import exchange as ex
        ex.invalidate_user_rates(None)
    except Exception:
        pass


@pytest.fixture
def client():
    return TestClient(main_module.app)


# --- Хелперы аутентификации ---

_counter = {"n": 0}


def register_and_login(client, email=None, password="secret123", premium=True):
    """Регистрирует пользователя и возвращает заголовок Authorization.

    По умолчанию повышает до Premium, чтобы лимиты Free-тарифа (и автосоздание
    стартовых счетов при регистрации) не мешали тестам фич. Для проверки самих
    лимитов вызывайте с premium=False.
    """
    _counter["n"] += 1
    email = email or f"user{_counter['n']}@test.com"
    username = f"user{_counter['n']}"
    r = client.post("/api/auth/register", json={
        "email": email, "username": username, "password": password,
    })
    assert r.status_code == 200, r.text
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    if premium:
        client.post("/api/me/upgrade", headers=headers)
    return headers


@pytest.fixture
def auth(client):
    return register_and_login(client)


def make_account(client, auth, name="Кошелёк", balance=0.0, currency="RUB", include_in_balance=True):
    r = client.post("/api/accounts/", headers=auth, json={
        "name": name, "type": "cash",
        "initial_currency": currency, "initial_balance": balance,
        "include_in_balance": include_in_balance,
    })
    assert r.status_code == 201, r.text
    return r.json()


def account_balance(client, auth, account_id, currency="RUB"):
    r = client.get("/api/accounts/", headers=auth)
    assert r.status_code == 200
    for a in r.json():
        if a["id"] == account_id:
            for b in a["balances"]:
                if b["currency"] == currency:
                    return b["balance"]
    return None
