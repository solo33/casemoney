from pydantic import BaseModel, Field


class ContributionCreate(BaseModel):
    amount: float = Field(gt=0)
