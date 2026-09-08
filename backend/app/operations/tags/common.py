"""Tags: common. Callers supply resolved user and database session."""
from fastapi import HTTPException



def _normalise_name(name: str) -> str:
    value = " ".join(name.split())
    if not value:
        raise HTTPException(status_code=400, detail="Название метки не может быть пустым")
    return value
