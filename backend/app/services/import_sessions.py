from dataclasses import asdict
from datetime import datetime
from decimal import Decimal
import json
import time
import uuid
from fastapi import HTTPException
from app.models.import_session import ImportSession


def save_preview(db, user_id, kind, rows):
    db.query(ImportSession).filter(ImportSession.expires_at < time.time()).delete(synchronize_session=False)
    token = uuid.uuid4().hex
    payload = json.loads(json.dumps([asdict(row) for row in rows], default=str))
    db.add(ImportSession(token=token, user_id=user_id, kind=kind, payload=payload, expires_at=time.time() + 1800))
    db.commit()
    return token


def claim_preview(db, user_id, kind, token, confirmation):
    session = db.query(ImportSession).filter(ImportSession.token == token).with_for_update().first()
    if not session or session.kind != kind or session.expires_at < time.time():
        raise HTTPException(404, "Предпросмотр истёк. Загрузите файл ещё раз")
    if session.user_id != user_id:
        raise HTTPException(403, "Чужой предпросмотр")
    if session.result is not None and session.confirmation != confirmation:
        raise HTTPException(409, "Этот импорт уже подтверждён с другими настройками")
    return session


def decode_tbank(rows, row_type):
    result = []
    for raw in rows:
        data = dict(raw)
        data["operation_at"] = datetime.fromisoformat(data["operation_at"]) if data["operation_at"] else None
        data["amount"] = Decimal(data["amount"])
        data["to_amount"] = Decimal(data["to_amount"]) if data["to_amount"] is not None else None
        data["source_lines"] = tuple(data["source_lines"])
        result.append(row_type(**data))
    return result
