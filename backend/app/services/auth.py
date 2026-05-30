from datetime import datetime, timedelta
from pathlib import Path
from jose import JWTError, jwt
from passlib.context import CryptContext
from dotenv import load_dotenv
import os

# Явный путь к backend/.env — чтобы load работал независимо от CWD,
# из которого запущен uvicorn (часто запускают из корня репо).
_ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(_ENV_PATH)

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# Защита от запуска без секрета / с тестовыми значениями
_BANNED_SECRETS = {"supersecretkey123", "secret", "changeme", "test", "changeme_long_random_string"}
if not SECRET_KEY:
    raise RuntimeError(
        "SECRET_KEY не задан. Установите переменную окружения SECRET_KEY "
        "(64+ случайных байта)."
    )
if SECRET_KEY.lower() in _BANNED_SECRETS or len(SECRET_KEY) < 32:
    raise RuntimeError(
        "SECRET_KEY слишком слабый. Сгенерируйте новый: "
        "python -c \"import secrets; print(secrets.token_urlsafe(64))\""
    )

# Контекст для хэширования паролей через bcrypt
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Проверяет совпадение пароля с хэшем"""
    return pwd_context.verify(plain_password, hashed_password)


def hash_password(password: str) -> str:
    """Хэширует пароль"""
    return pwd_context.hash(password)


def create_access_token(data: dict) -> str:
    """Создаёт JWT токен"""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    """Декодирует JWT токен, возвращает payload"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


# === Активация email ===

ACTIVATION_TOKEN_TTL_HOURS = 24


def create_activation_token(user_id: int) -> str:
    """Подписанный JWT для активации email. TTL 24ч."""
    exp = datetime.utcnow() + timedelta(hours=ACTIVATION_TOKEN_TTL_HOURS)
    return jwt.encode(
        {"sub": str(user_id), "purpose": "activate", "exp": exp},
        SECRET_KEY, algorithm=ALGORITHM,
    )


def verify_activation_token(token: str) -> int | None:
    """Возвращает user_id если токен валидный и для активации, иначе None."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None
    if payload.get("purpose") != "activate":
        return None
    sub = payload.get("sub")
    return int(sub) if sub else None
