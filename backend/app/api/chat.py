import asyncio
import os
import uuid
from collections import OrderedDict

import google.generativeai as genai
from fastapi import APIRouter, Request
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address

router = APIRouter(prefix="/api/chat", tags=["chat"])
limiter = Limiter(key_func=get_remote_address)

# ── База знаний CaseMoney ────────────────────────────────────────────────────
_KNOWLEDGE = """
CaseMoney — веб-приложение для учёта личных финансов.
Сайт: casemoney.ru

## КАК НАЧАТЬ
- Зарегистрируйтесь на сайте и подтвердите email (письмо придёт в течение минуты).
- Можно попробовать без регистрации через кнопку «Демо-вход» на странице входа.
- После входа создайте первый счёт: кнопка «+» → «Добавить счёт».

## СЧЕТА
- Типы: наличные, банковская карта, вклад, другое.
- Можно создать несколько счетов, в том числе в разных валютах.
- Счета объединяются в группы (папки) для удобства.
- На главной странице отображается суммарный баланс по всем счетам.

## ТРАНЗАКЦИИ
- Три вида: Доход, Расход, Перевод между счетами.
- Быстрое добавление через кнопку «+» в правом нижнем углу или FAB.
- Каждой транзакции можно назначить категорию, добавить комментарий и дату.
- Список всех транзакций — раздел «История».

## КАТЕГОРИИ
- Отдельные списки для доходов и для расходов.
- Поддерживается вложенность: основная категория → подкатегория.
- Можно задать цвет и иконку.
- Настройка категорий — раздел «Категории» в меню.

## ДАШБОРД И ОТЧЁТЫ
- Главная страница (Dashboard) показывает баланс и графики за текущий месяц.
- Раздел «Отчёты» — разбивка расходов по категориям (круговая диаграмма), динамика по месяцам.
- Годовой отчёт и сравнение год-к-году (YoY) — в том же разделе.

## ЦЕЛИ
- Раздел «Цели» — создание накопительных целей с прогресс-баром.
- Пополнение цели списывает сумму с выбранного счёта.

## ИМПОРТ / ЭКСПОРТ
- Импорт выписки: раздел «Импорт» поддерживает CSV от Тинькофф и других банков.
- Экспорт транзакций в CSV или Excel — раздел «Экспорт».

## СЕМЕЙНЫЙ ПЛАН
- Совместный доступ нескольких пользователей к одним счетам.
- Раздел «Семья» — приглашение участников.
- Подписка Family — 299 руб/мес или 2 990 руб/год.

## КРЕДИТЫ
- Раздел «Кредиты» — учёт кредитных обязательств и ипотек.
- Напоминания о ближайших платежах.

## СПИСКИ ПОКУПОК
- Раздел «Покупки» — ведение списков покупок с чекбоксами.

## МОБИЛЬНОЕ ПРИЛОЖЕНИЕ
- CaseMoney работает как PWA: в браузере на телефоне нажмите «Добавить на главный экран».
- Также есть Android-приложение.

## ТЕХПОДДЕРЖКА
- Форма обратной связи: Настройки → Поддержка.
- Email: support@casemoney.ru
"""

_SYSTEM_PROMPT = f"""Ты вежливый ассистент сервиса CaseMoney — приложения для учёта личных финансов.
Отвечай кратко и по делу. Общайся на языке пользователя (русский или английский).
Используй только информацию из базы знаний ниже.

=== БАЗА ЗНАНИЙ ===
{_KNOWLEDGE}
=== КОНЕЦ БАЗЫ ЗНАНИЙ ===

Если вопрос выходит за рамки базы знаний — предложи написать в поддержку: support@casemoney.ru"""

TRANSFER_SIGNAL = "TRANSFER_TO_OPERATOR"

# ── Gemini-модель ────────────────────────────────────────────────────────────
_model = None


def _get_model():
    global _model
    if _model is None:
        api_key = os.getenv("GEMINI_API_KEY", "")
        if not api_key:
            return None
        genai.configure(api_key=api_key)
        _model = genai.GenerativeModel(
            model_name="gemini-2.5-flash",
            system_instruction=_SYSTEM_PROMPT,
        )
    return _model


# ── Хранилище сессий (in-memory, не нужна БД) ───────────────────────────────
_MAX_SESSIONS = 200
_MAX_HISTORY = 20
_sessions: OrderedDict[str, list[dict]] = OrderedDict()


def _get_history(session_id: str) -> list[dict]:
    return _sessions.get(session_id, [])


def _save_history(session_id: str, history: list[dict]):
    if session_id in _sessions:
        _sessions.move_to_end(session_id)
    _sessions[session_id] = history[-_MAX_HISTORY:]
    while len(_sessions) > _MAX_SESSIONS:
        _sessions.popitem(last=False)


# ── Схемы ────────────────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    session_id: str = Field(default_factory=lambda: str(uuid.uuid4()), max_length=64)


class ChatResponse(BaseModel):
    reply: str
    session_id: str


# ── Эндпоинт ─────────────────────────────────────────────────────────────────
@router.post("", response_model=ChatResponse)
@limiter.limit("30/hour")
async def chat(data: ChatRequest, request: Request):
    model = _get_model()
    if model is None:
        return ChatResponse(
            reply="Чат временно недоступен. Напишите нам на support@casemoney.ru",
            session_id=data.session_id,
        )

    history = _get_history(data.session_id)
    history.append({"role": "user", "parts": [data.message]})

    try:
        chat_session = model.start_chat(history=history[:-1])
        response = await asyncio.to_thread(chat_session.send_message, data.message)
        reply = response.text.strip()
    except Exception:
        reply = "Произошла ошибка. Попробуйте ещё раз или напишите на support@casemoney.ru"
    else:
        history.append({"role": "model", "parts": [reply]})
        _save_history(data.session_id, history)

    return ChatResponse(reply=reply, session_id=data.session_id)
