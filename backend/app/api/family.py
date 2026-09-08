from app.api.responses import operation_response
"""HTTP routes; application operations own validation and transaction boundaries."""
from app.api.dependencies import current_user_id, require_family_user_id
from typing import Optional
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.operations.family import members, accounts, accounting, analytics, recurring, settlements
from app.schemas.family_views import AccountAccessUpdate, FamilyAnalyticsExportRequest, FamilyCreate, FamilyExpenseAccept, FamilyExpenseAcceptBatch, InviteCreate, MemberRoleUpdate, SettlementCreate


router = APIRouter(
    prefix="/api/family",
    tags=["family"],
    dependencies=[Depends(require_family_user_id)],
)

@router.get("/")
def get_family(
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
):
    return operation_response(members.get_family(db=db, user_id=user_id))


@router.post("/", status_code=201)
def create_family(
    data: FamilyCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
):
    return operation_response(members.create_family(data=data, db=db, user_id=user_id))


@router.post("/invite", status_code=201)
def invite_member(
    data: InviteCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
):
    return operation_response(members.invite_member(data=data, db=db, user_id=user_id))


@router.patch("/members/{member_id}/role")
def update_member_role(
    member_id: int,
    data: MemberRoleUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
):
    return operation_response(members.update_member_role(member_id=member_id, data=data, db=db, user_id=user_id))


@router.get("/accounts")
def list_family_accounts(
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
):
    return operation_response(accounts.list_family_accounts(db=db, user_id=user_id))


@router.put("/accounts/{account_id}/access")
def update_account_access(
    account_id: int,
    data: AccountAccessUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
):
    return operation_response(accounts.update_account_access(account_id=account_id, data=data, db=db, user_id=user_id))


@router.delete("/members/{member_id}", status_code=204)
def remove_member(
    member_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
):
    'Убрать участника из семьи — владельцем (в т.ч. пока приглашение ещё\n    не принято) или самим участником (выход из семьи).'
    return operation_response(members.remove_member(member_id=member_id, db=db, user_id=user_id))


@router.post("/invitations/{invitation_id}/accept")
def accept_invitation(
    invitation_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
):
    return operation_response(members.accept_invitation(invitation_id=invitation_id, db=db, user_id=user_id))


@router.get("/expense-accounting/pending")
def pending_family_expense_accounting(
    year: Optional[int] = None,
    month: Optional[int] = None,
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
):
    return operation_response(accounting.pending_family_expense_accounting(year=year, month=month, db=db, user_id=user_id))


@router.post("/expense-accounting/{accounting_id}/accept")
def accept_family_expense_accounting(
    accounting_id: int,
    data: FamilyExpenseAccept,
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
):
    return operation_response(accounting.accept_family_expense_accounting(accounting_id=accounting_id, data=data, db=db, user_id=user_id))


@router.post("/expense-accounting/accept-batch")
def accept_family_expense_accounting_batch(
    data: FamilyExpenseAcceptBatch,
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
):
    'Create actual owner expenses for the selected common purchases in one commit.'
    return operation_response(accounting.accept_family_expense_accounting_batch(data=data, db=db, user_id=user_id))


@router.get("/members/{member_id}/settlement-accounts")
def member_settlement_accounts(
    member_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
):
    return operation_response(accounts.member_settlement_accounts(member_id=member_id, db=db, user_id=user_id))


@router.get("/report")
def family_report(
    year: Optional[int] = None,
    month: Optional[int] = None,
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
):
    return operation_response(analytics.family_report(year=year, month=month, db=db, user_id=user_id))


@router.get("/analytics")
def family_analytics(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
):
    return operation_response(analytics.family_analytics(year=year, month=month, db=db, user_id=user_id))


@router.get("/analytics/pdf")
def download_family_analytics_pdf(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
):
    return operation_response(analytics.download_family_analytics_pdf(year=year, month=month, db=db, user_id=user_id))


@router.post("/analytics/email")
def email_family_analytics(
    payload: FamilyAnalyticsExportRequest,
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
):
    return operation_response(analytics.email_family_analytics(payload=payload, db=db, user_id=user_id))


@router.get("/recurring-suggestions")
def family_recurring_suggestions(
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
):
    'Suggest, but never automatically create, recurring common payments.'
    return operation_response(recurring.family_recurring_suggestions(db=db, user_id=user_id))


@router.post("/recurring-suggestions/{fingerprint}/dismiss", status_code=201)
def dismiss_family_recurring_suggestion(
    fingerprint: str,
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
):
    return operation_response(recurring.dismiss_family_recurring_suggestion(fingerprint=fingerprint, db=db, user_id=user_id))


@router.post("/recurring-suggestions/{fingerprint}/create-recurring", status_code=201)
def create_family_recurring_suggestion(
    fingerprint: str,
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
):
    return operation_response(recurring.create_family_recurring_suggestion(fingerprint=fingerprint, db=db, user_id=user_id))


@router.post("/settlements", status_code=201)
def create_settlement(
    data: SettlementCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(current_user_id),
):
    return operation_response(settlements.create_settlement(data=data, db=db, user_id=user_id))
