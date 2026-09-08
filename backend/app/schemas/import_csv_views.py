from pydantic import BaseModel, Field
from typing import Optional
from app.schemas.import_csv import PreviewResponse


class PreviewResponseWithToken(PreviewResponse):
    import_token: str


class ConfirmRequest(BaseModel):
    import_token: str


class TBankConfirmRequest(BaseModel):
    import_token: str
    account_mappings: dict[str, Optional[int]]
    category_mappings: dict[str, Optional[int]] = Field(default_factory=dict)
