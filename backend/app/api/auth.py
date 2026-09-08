from app.api.responses import operation_response
"""HTTP routes; application operations own validation and transaction boundaries."""
from fastapi import APIRouter, Depends, BackgroundTasks, Query, Request
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.database import get_db
from app.schemas.user import UserRegister, UserLogin, Token
from app.operations.auth import queries, commands
from app.schemas.auth_views import ActivationResult, ForgotPasswordRequest, ForgotPasswordResponse, PublicConfig, RegisterResponse, ResendRequest, ResendResponse, ResetPasswordRequest, VerifyCodeRequest


limiter = Limiter(key_func=get_remote_address)

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.get("/config", response_model=PublicConfig)
def public_config(db: Session = Depends(get_db)):
    'Публичные флаги для неавторизованных страниц (логин/регистрация).'
    return operation_response(queries.public_config(db=db))


@router.post("/register", response_model=RegisterResponse)
@limiter.limit("5/hour;10/day")
def register(
    request: Request,
    data: UserRegister,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
):
    return operation_response(commands.register(request=request, data=data, background=background, db=db))


@router.post("/verify-code", response_model=Token)
@limiter.limit("20/hour")
def verify_code(
    request: Request,
    data: VerifyCodeRequest,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
):
    'Проверяет код и создаёт пользователя. Возвращает токен (автологин).'
    return operation_response(commands.verify_code(request=request, data=data, background=background, db=db))


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
@limiter.limit("5/hour")
def forgot_password(
    request: Request,
    data: ForgotPasswordRequest,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
):
    'Запрос сброса пароля. Всегда отвечаем ok=True (не раскрываем, есть ли\n    такой email), но письмо шлём только если пользователь реально существует.'
    return operation_response(commands.forgot_password(request=request, data=data, background=background, db=db))


@router.post("/reset-password")
def reset_password(data: ResetPasswordRequest, db: Session = Depends(get_db)):
    return operation_response(commands.reset_password(data=data, db=db))


@router.post("/login", response_model=Token)
@limiter.limit("20/minute;200/hour")
def login(request: Request, data: UserLogin, db: Session = Depends(get_db)):
    return operation_response(commands.login(request=request, data=data, db=db))


@router.post("/demo", response_model=Token)
@limiter.limit("20/hour")
def demo_login(request: Request, db: Session = Depends(get_db)):
    'Публичная кнопка «Заполнить демо-вход»: создаёт изолированный\n    одноразовый аккаунт с каноничным набором демо-данных и сразу логинит в\n    него. Отдельно от статического test@test.com (см. app/seeds.py) —\n    каждый посетитель получает свою песочницу, не видит чужих правок.'
    return operation_response(commands.demo_login(request=request, db=db))


@router.get("/activate", response_model=ActivationResult)
def activate_get(
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    'Активация email по токену из письма (GET — чтобы по клику работало).'
    return operation_response(queries.activate_get(token=token, db=db))


@router.post("/resend-activation", response_model=ResendResponse)
@limiter.limit("3/hour;10/day")
def resend_activation(
    request: Request,
    data: ResendRequest,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
):
    'Повторно отправить письмо активации. Не раскрываем существует ли email.'
    return operation_response(commands.resend_activation(request=request, data=data, background=background, db=db))
