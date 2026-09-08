"""Automation: common. Callers supply resolved user and database session."""
from app.models.category import Category
from app.models.category_rule import CategoryRule
from app.models.user import User
from app.schemas.automation import AutomationSettings, CategoryRuleResponse



def _rule_response(rule: CategoryRule, category: Category) -> CategoryRuleResponse:
    return CategoryRuleResponse(
        id=rule.id,
        pattern=rule.pattern,
        category_id=category.id,
        category_name=category.name,
        category_type=category.type,
        is_active=rule.is_active,
    )


def _settings_response(user: User) -> AutomationSettings:
    return AutomationSettings(
        rules_enabled=bool(user.automation_rules_enabled),
        duplicates_enabled=bool(user.automation_duplicates_enabled),
    )
