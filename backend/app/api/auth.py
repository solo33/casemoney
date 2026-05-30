from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.schemas.user import UserRegister, UserLogin, UserResponse, Token
from app.services.auth import hash_password, verify_password, create_access_token
from app.models.category import Category
from app.models.user_currency import UserCurrency
from app.seeds import seed_default_categories

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=UserResponse)
def register(data: UserRegister, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email уже зарегистрирован")

    user = User(
        email=data.email,
        username=data.username,
        hashed_password=hash_password(data.password)
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Создаём дефолтную user_currency = main_currency (для лимита бесплатной 1 валюты)
    db.add(UserCurrency(user_id=user.id, currency=user.main_currency, auto=True))
    db.commit()

    # FIN-17: seed дефолтных категорий
    seed_default_categories(db, user.id)
    return user

@router.post("/login", response_model=Token)
def login(data: UserLogin, db: Session = Depends(get_db)):
    # Ищем пользователя
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Неверный email или пароль")

    # Создаём токен
    token = create_access_token({"sub": str(user.id)})
    return {"access_token": token, "token_type": "bearer"}