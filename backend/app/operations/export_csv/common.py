"""Export_csv: common. Callers supply resolved user and database session."""
from typing import Optional
from app.models.category import Category



_CSV_INJECT_CHARS = ("=", "+", "-", "@", "\t", "\r")


def _format_amount(value: float) -> str:
    # русский формат: запятая как десятичный разделитель, 2 знака
    return f"{value:.2f}".replace(".", ",")


def _safe_text(value: str) -> str:
    """Защита от CSV formula injection (OWASP): экранируем значения,
    начинающиеся с =/+/-/@/таб/CR — Excel и Google Sheets интерпретируют их как формулы."""
    if not value:
        return value or ""
    if value[:1] in _CSV_INJECT_CHARS:
        return "'" + value
    return value


def _category_path(cat: Optional[Category], by_id: dict[int, Category]) -> str:
    """Возвращает 'Parent\\Child' или просто имя если корневая."""
    if not cat:
        return ""
    if cat.parent_id and cat.parent_id in by_id:
        parent = by_id[cat.parent_id]
        return f"{parent.name}\\{cat.name}"
    return cat.name
