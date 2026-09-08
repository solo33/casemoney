"""Automation: commands. Callers supply resolved user and database session."""
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.models.category import Category
from app.models.category_rule import CategoryRule
from app.models.user import User
from app.schemas.automation import AutomationSettingsUpdate, CategoryRuleCreate
from app.services.automation import normalize_rule_pattern
from app.operations.automation.common import _rule_response, _settings_response


def update_settings(data: AutomationSettingsUpdate, db: Session=None, user_id: int=None):
    user = db.query(User).filter(User.id == user_id).one()
    if data.rules_enabled is not None:
        user.automation_rules_enabled = data.rules_enabled
    if data.duplicates_enabled is not None:
        user.automation_duplicates_enabled = data.duplicates_enabled
    db.commit()
    db.refresh(user)
    return _settings_response(user)


def create_rule(data: CategoryRuleCreate, db: Session=None, user_id: int=None):
    pattern = normalize_rule_pattern(data.pattern)
    if len(pattern) < 2:
        raise HTTPException(status_code=400, detail="Укажите не менее двух символов из назначения операции.")
    category = db.query(Category).filter(Category.id == data.category_id, Category.user_id == user_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Категория не найдена.")
    rule = CategoryRule(user_id=user_id, category_id=category.id, pattern=pattern)
    db.add(rule)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Такое правило уже есть.")
    db.refresh(rule)
    return _rule_response(rule, category)


def delete_rule(rule_id: int, db: Session=None, user_id: int=None):
    rule = db.query(CategoryRule).filter(CategoryRule.id == rule_id, CategoryRule.user_id == user_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Правило не найдено.")
    db.delete(rule)
    db.commit()
