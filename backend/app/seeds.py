from sqlalchemy.orm import Session
from app.models.category import Category
from app.constants import DEFAULT_CATEGORIES

def seed_default_categories(db: Session, user_id: int):
    for cat in DEFAULT_CATEGORIES:
        db.add(Category(**cat, user_id=user_id, is_default=True))
    db.commit()