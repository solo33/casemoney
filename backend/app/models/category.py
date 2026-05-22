from sqlalchemy import Column, Integer, String, Boolean, ForeignKey
from app.database import Base

class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    color = Column(String, default="#6366f1")   # hex цвет
    icon = Column(String, nullable=True)         # emoji или название иконки
    is_default = Column(Boolean, default=False)  # системные категории