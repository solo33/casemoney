from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.account import Account
from app.models.account_balance import AccountBalance
from app.models.transaction import Transaction
from app.models.category import Category
from app.models.account_group import AccountGroup
from app.models.user_currency import UserCurrency
from app.models.shopping import ShoppingList
from app.schemas.user import UserResponse, UserUpdate, PasswordChange
from app.services.auth import decode_token, hash_password, normalize_email, verify_password
from app.services import limits as limits_svc

router = APIRouter(prefix="/api/me", tags=["me"])
security = HTTPBearer()


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> int:
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    return int(payload["sub"])


def _get_user(db: Session, user_id: int) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get("/", response_model=UserResponse)
def get_me(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    return _get_user(db, user_id)


@router.put("/", response_model=UserResponse)
def update_me(
    data: UserUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    user = _get_user(db, user_id)
    update_fields = data.model_dump(exclude_unset=True)
    if "main_currency" in update_fields and update_fields["main_currency"]:
        update_fields["main_currency"] = update_fields["main_currency"].upper()
    if "email" in update_fields and update_fields["email"]:
        update_fields["email"] = normalize_email(str(update_fields["email"]))
        # проверим уникальность
        other = db.query(User).filter(
            func.lower(func.trim(User.email)) == update_fields["email"],
            User.id != user_id,
        ).first()
        if other:
            raise HTTPException(status_code=400, detail="Email уже занят")
    for k, v in update_fields.items():
        setattr(user, k, v)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Email уже занят")
    db.refresh(user)
    if "main_currency" in update_fields:
        from app.services import exchange as exchange_svc
        exchange_svc.invalidate_user_rates(user_id)
    return user


@router.post("/password", status_code=204)
def change_password(
    data: PasswordChange,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    user = _get_user(db, user_id)
    if not verify_password(data.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Текущий пароль неверен")
    user.hashed_password = hash_password(data.new_password)
    db.commit()


@router.delete("/transactions", status_code=204)
def delete_all_transactions(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Удаляет ВСЕ транзакции пользователя. Балансы счетов обнуляются."""
    db.query(Transaction).filter(Transaction.user_id == user_id).delete(synchronize_session=False)
    # Сбрасываем балансы всех счетов в 0
    acc_ids = [a.id for a in db.query(Account).filter(Account.user_id == user_id).all()]
    if acc_ids:
        db.query(AccountBalance).filter(
            AccountBalance.account_id.in_(acc_ids)
        ).update({AccountBalance.balance: 0}, synchronize_session=False)
    db.commit()


@router.post("/reset", status_code=204)
def reset_account(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Удаляет ВСЕ данные пользователя кроме самого аккаунта.

    Удаляются: транзакции, балансы, счета, группы счетов, категории, валюты.
    """
    # Порядок важен из-за FK
    acc_ids = [a.id for a in db.query(Account).filter(Account.user_id == user_id).all()]
    db.query(Transaction).filter(Transaction.user_id == user_id).delete(synchronize_session=False)
    if acc_ids:
        db.query(AccountBalance).filter(
            AccountBalance.account_id.in_(acc_ids)
        ).delete(synchronize_session=False)
    db.query(Account).filter(Account.user_id == user_id).delete(synchronize_session=False)
    db.query(AccountGroup).filter(AccountGroup.user_id == user_id).delete(synchronize_session=False)
    db.query(Category).filter(Category.user_id == user_id).delete(synchronize_session=False)
    db.query(UserCurrency).filter(UserCurrency.user_id == user_id).delete(synchronize_session=False)
    db.query(ShoppingList).filter(ShoppingList.user_id == user_id).delete(synchronize_session=False)
    db.commit()


@router.get("/limits")
def get_limits(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Текущее использование + активный тариф."""
    return limits_svc.get_limits_status(db, user_id)


@router.delete("/", status_code=204)
def delete_account(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Полностью удаляет пользователя и все его данные."""
    acc_ids = [a.id for a in db.query(Account).filter(Account.user_id == user_id).all()]
    db.query(Transaction).filter(Transaction.user_id == user_id).delete(synchronize_session=False)
    if acc_ids:
        db.query(AccountBalance).filter(
            AccountBalance.account_id.in_(acc_ids)
        ).delete(synchronize_session=False)
    db.query(Account).filter(Account.user_id == user_id).delete(synchronize_session=False)
    db.query(AccountGroup).filter(AccountGroup.user_id == user_id).delete(synchronize_session=False)
    db.query(Category).filter(Category.user_id == user_id).delete(synchronize_session=False)
    db.query(UserCurrency).filter(UserCurrency.user_id == user_id).delete(synchronize_session=False)
    db.query(ShoppingList).filter(ShoppingList.user_id == user_id).delete(synchronize_session=False)
    db.query(User).filter(User.id == user_id).delete(synchronize_session=False)
    db.commit()
