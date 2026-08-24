"""Глобальная конфигурация (single-row app_config). Кешируется в памяти на 60 сек."""
import time
from sqlalchemy.orm import Session

from app.models.app_config import AppConfig

_CACHE_TTL = 60
_cache: dict = {"data": None, "ts": 0}


def get_config(db: Session) -> AppConfig:
    """Возвращает (или создаёт) единственную запись id=1."""
    now = time.time()
    if _cache["data"] is not None and now - _cache["ts"] < _CACHE_TTL:
        # возвращаем актуальный объект из БД (кешируем только сам факт что есть)
        pass
    cfg = db.query(AppConfig).filter(AppConfig.id == 1).first()
    if cfg is None:
        cfg = AppConfig(id=1, require_email_verification=True)
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    _cache["data"] = True
    _cache["ts"] = now
    return cfg


def invalidate_cache():
    _cache["data"] = None
    _cache["ts"] = 0


def is_email_verification_required(db: Session) -> bool:
    return get_config(db).require_email_verification


def is_billing_enabled(db: Session) -> bool:
    """False = launch mode: Family is free for every user, no payment required."""
    return get_config(db).billing_enabled
