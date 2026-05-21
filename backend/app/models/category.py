from sqlalchemy import Column, Integer, String, ForeignKey
from app.database import Base


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    icon = Column(String, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)