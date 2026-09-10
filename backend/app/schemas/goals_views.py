from app.money import MoneyValue
from pydantic import BaseModel, Field


class ContributionCreate(BaseModel):
    amount: MoneyValue = Field(gt=0)
