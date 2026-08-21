from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class NotificationResponse(BaseModel):
    id: int
    title: str
    message: str
    link: Optional[str]
    created_at: datetime
    read_at: Optional[datetime]

    class Config:
        from_attributes = True


class NotificationsPage(BaseModel):
    items: list[NotificationResponse]
    unread_count: int


class NotificationChannelSettings(BaseModel):
    in_app: bool
    email: bool


class NotificationSettingsResponse(BaseModel):
    events: dict[str, dict[str, str]]
    preferences: dict[str, NotificationChannelSettings]


class NotificationSettingsUpdate(BaseModel):
    preferences: dict[str, NotificationChannelSettings]


class AdminNotificationCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    message: str = Field(min_length=1, max_length=4000)
    link: Optional[str] = Field(None, max_length=500)
    user_id: Optional[int] = None

    @field_validator("link")
    @classmethod
    def validate_link(cls, value: Optional[str]) -> Optional[str]:
        if not value:
            return None
        value = value.strip()
        if not (value.startswith("/") or value.startswith("https://") or value.startswith("http://")):
            raise ValueError("Ссылка должна начинаться с /, http:// или https://")
        return value

    @field_validator("title", "message")
    @classmethod
    def reject_blank_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Поле не может быть пустым")
        return value
