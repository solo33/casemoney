"""Chat: commands. Callers supply resolved user and database session."""
import asyncio
from fastapi import Request
from app.operations.chat.common import _get_history, _get_model, _save_history
from app.schemas.chat_views import ChatRequest, ChatResponse


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
