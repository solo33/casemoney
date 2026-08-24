from pydantic import BaseModel, Field, field_validator


class PushSubscriptionCreate(BaseModel):
    endpoint: str = Field(min_length=10, max_length=4000)
    p256dh: str = Field(min_length=10, max_length=512)
    auth: str = Field(min_length=4, max_length=512)
    user_agent: str | None = Field(default=None, max_length=500)

    @field_validator("endpoint")
    @classmethod
    def endpoint_must_be_https(cls, value: str) -> str:
        value = value.strip()
        if not value.startswith("https://"):
            raise ValueError("Адрес push-подписки должен использовать HTTPS")
        return value


class PushSubscriptionDelete(BaseModel):
    endpoint: str = Field(min_length=10, max_length=4000)


class PushConfigResponse(BaseModel):
    enabled: bool
    public_key: str | None = None
