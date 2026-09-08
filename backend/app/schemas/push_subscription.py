from pydantic import BaseModel, Field, field_validator
from urllib.parse import urlsplit


def validate_push_endpoint(value: str) -> str:
    value = value.strip()
    parsed = urlsplit(value)
    host = (parsed.hostname or "").lower()
    providers = ("fcm.googleapis.com", "updates.push.services.mozilla.com", "notify.windows.com", "push.apple.com")
    if parsed.scheme != "https" or parsed.username or parsed.password or parsed.port not in (None, 443) or not any(host == domain or host.endswith("." + domain) for domain in providers):
        raise ValueError("Неподдерживаемый адрес службы push-уведомлений")
    return value


class PushSubscriptionCreate(BaseModel):
    endpoint: str = Field(min_length=10, max_length=4000)
    p256dh: str = Field(min_length=10, max_length=512)
    auth: str = Field(min_length=4, max_length=512)
    user_agent: str | None = Field(default=None, max_length=500)

    @field_validator("endpoint")
    @classmethod
    def endpoint_must_be_https(cls, value: str) -> str:
        return validate_push_endpoint(value)


class PushSubscriptionDelete(BaseModel):
    endpoint: str = Field(min_length=10, max_length=4000)


class PushConfigResponse(BaseModel):
    enabled: bool
    public_key: str | None = None
