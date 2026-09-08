from sqlalchemy import Column, String, Integer, ForeignKey, JSON, Float
from app.database import Base


class ImportSession(Base):
    __tablename__ = "import_sessions"
    token = Column(String(64), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    kind = Column(String(16), nullable=False)
    payload = Column(JSON, nullable=False)
    expires_at = Column(Float, nullable=False, index=True)
    result = Column(JSON, nullable=True)
    confirmation = Column(JSON, nullable=True)
