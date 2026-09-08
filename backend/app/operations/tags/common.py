"""Tags: common. Callers supply resolved user and database session."""
from app.application import ApplicationError



def _normalise_name(name: str) -> str:
    value = " ".join(name.split())
    if not value:
        raise ApplicationError(status_code=400, detail="Название метки не может быть пустым")
    return value
