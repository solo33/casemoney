from pydantic import BaseModel
from typing import List, Optional


class PreviewRow(BaseModel):
    line_no: int
    date: Optional[str]
    account: str
    category_path: Optional[str]
    amount: float
    abs_amount: float
    currency: str
    description: Optional[str]
    transfer_to: Optional[str]
    tx_type: str
    error: Optional[str]


class ImportTotals(BaseModel):
    rows_total: int
    ok: int
    errors: int
    transfers: int
    income_sum: float
    expense_sum: float


class PreviewResponse(BaseModel):
    rows: List[PreviewRow]
    new_accounts: List[str]
    existing_accounts: List[str]
    new_categories: List[dict]
    existing_categories: List[str]
    currencies_to_add: List[str]
    totals: ImportTotals


class ConfirmResponse(BaseModel):
    imported: int
    skipped: int
    errors: List[dict]
