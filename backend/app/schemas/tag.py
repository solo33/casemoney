from pydantic import BaseModel, Field


class TagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    color: str = Field("#2f6296", min_length=4, max_length=16)


class TagUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=64)
    color: str | None = Field(None, min_length=4, max_length=16)


class TagResponse(BaseModel):
    id: int
    name: str
    color: str

    class Config:
        from_attributes = True
