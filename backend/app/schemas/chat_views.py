import uuid
from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    session_id: str = Field(default_factory=lambda: str(uuid.uuid4()), max_length=64)


class ChatResponse(BaseModel):
    reply: str
    session_id: str
