"""HTTP routes; application operations own validation and transaction boundaries."""
from app.api.dependencies import current_user_id as get_current_user_id
from datetime import date
from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.schemas.transaction import TransactionCreate, TransactionUpdate, TransactionResponse, TransactionBulkCategoryUpdate, TransactionBulkUpdateResult, TransferSuggestion, TransferMatchConfirm
from app.operations.transactions import queries, transfers, commands
from app.schemas.transactions_views import HistoryPage, TransactionsPage


router = APIRouter(prefix="/api/transactions", tags=["transactions"])

@router.get("/history", response_model=HistoryPage)
def get_history(
    q: Optional[str] = Query(None, description="Поиск по счёту, категории, примечанию"),
    action: Optional[str] = Query(None, description="created | edited | deleted"),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    'Журнал изменений операций пользователя (новые сверху).'
    return queries.get_history(q=q, action=action, limit=limit, offset=offset, db=db, user_id=user_id)


@router.get("/frequent-categories")
def frequent_categories(
    tx_type: str = Query("expense", pattern="^(income|expense)$"),
    limit: int = Query(8, ge=1, le=12),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    "Most used own categories for the quick-entry form.\n\n    The result is suggestion-only: it never selects or changes a category on\n    behalf of the user.  Planned operations are excluded because the goal is\n    to make today's entry fast.\n    "
    return queries.frequent_categories(tx_type=tx_type, limit=limit, db=db, user_id=user_id)


@router.get("/transfer-suggestions", response_model=List[TransferSuggestion])
def transfer_suggestions(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    'Find likely two-sided own-account transfers for a user to review.'
    return transfers.transfer_suggestions(db=db, user_id=user_id)


@router.post("/{transaction_id}/confirm-transfer-match", response_model=TransactionResponse)
def confirm_transfer_match(
    transaction_id: int,
    data: TransferMatchConfirm,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    'Replace a confirmed expense/income pair with one transfer.'
    return transfers.confirm_transfer_match(transaction_id=transaction_id, data=data, db=db, user_id=user_id)


@router.get("/", response_model=TransactionsPage)
def get_transactions(
    account_id: Optional[int] = Query(None),
    currency: Optional[str] = Query(None),
    type: Optional[str] = Query(None, description="income | expense | transfer"),
    category_id: Optional[int] = Query(None, description="вкл. подкатегории"),
    tag_id: Optional[int] = Query(None, description="личная метка/проект"),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    q: Optional[str] = Query(None, description="Поиск в описании"),
    is_planned: Optional[bool] = Query(None, description="Planned or actual operations"),
    limit: int = Query(50, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    return queries.get_transactions(account_id=account_id, currency=currency, type=type, category_id=category_id, tag_id=tag_id, date_from=date_from, date_to=date_to, q=q, is_planned=is_planned, limit=limit, offset=offset, db=db, user_id=user_id)


@router.post("/", response_model=TransactionResponse, status_code=201)
def create_transaction(
    data: TransactionCreate,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    return commands.create_transaction(data=data, idempotency_key=idempotency_key, db=db, user_id=user_id)


@router.patch("/bulk/category", response_model=TransactionBulkUpdateResult)
def bulk_update_category(
    data: TransactionBulkCategoryUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    'Categorise a selection of historic income or expense rows.\n\n    Transfers are deliberately excluded: a transfer has no category and changing\n    it here would make the ledger misleading.  The selected rows must have one\n    type, because an income category cannot be applied to an expense (and vice\n    versa).\n    '
    return commands.bulk_update_category(data=data, db=db, user_id=user_id)


@router.patch("/{transaction_id}", response_model=TransactionResponse)
def update_transaction(
    transaction_id: int,
    data: TransactionUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    'Редактирование транзакции. Балансы пересчитываются корректно:\n    откат старого эффекта → применение нового.'
    return commands.update_transaction(transaction_id=transaction_id, data=data, db=db, user_id=user_id)


@router.delete("/{transaction_id}", status_code=204)
def delete_transaction(
    transaction_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    return commands.delete_transaction(transaction_id=transaction_id, db=db, user_id=user_id)
