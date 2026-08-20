"""Small, deterministic transaction automation helpers.

Rules only fill an empty category.  They never rewrite an explicitly chosen
category, so the user remains in full control of historic data.
"""
from __future__ import annotations

from app.models.category import Category
from app.models.category_rule import CategoryRule


def normalize_rule_pattern(value: str) -> str:
    return " ".join(value.strip().casefold().split())


def matched_category_id(
    db,
    user_id: int,
    description: str | None,
    category_type: str,
) -> int | None:
    text = normalize_rule_pattern(description or "")
    if not text:
        return None
    rules = (
        db.query(CategoryRule)
        .join(Category, Category.id == CategoryRule.category_id)
        .filter(
            CategoryRule.user_id == user_id,
            CategoryRule.is_active.is_(True),
            Category.user_id == user_id,
            Category.type == category_type,
        )
        .all()
    )
    # Prefer the most specific matching phrase: "пятёрочка доставка" wins
    # over a generic "пятёрочка".
    matches = [rule for rule in rules if rule.pattern in text]
    if not matches:
        return None
    return max(matches, key=lambda item: len(item.pattern)).category_id
