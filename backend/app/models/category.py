from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, Index
from sqlalchemy.orm import relationship
from app.database import Base


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False, default="expense")  # income | expense
    color = Column(String, default="#6366f1")   # hex цвет
    icon = Column(String, nullable=True)         # emoji или название иконки
    is_default = Column(Boolean, default=False)  # системные категории
    sort_order = Column(Integer, nullable=False, default=0)

    # Иерархия (макс. 2 уровня). NULL = корневая категория.
    # Ограничение глубины проверяется на уровне API (FIN-48).
    parent_id = Column(Integer, ForeignKey("categories.id", ondelete="CASCADE"), nullable=True)

    parent = relationship("Category", remote_side="Category.id", back_populates="children")
    children = relationship(
        "Category",
        back_populates="parent",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("ix_categories_user_parent", "user_id", "parent_id"),
        Index("ix_categories_user_parent_sort", "user_id", "parent_id", "sort_order"),
    )
