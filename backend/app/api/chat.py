from app.api.responses import operation_response
"""HTTP routes; application operations own validation and transaction boundaries."""
from fastapi import APIRouter, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.operations.chat import commands
from app.schemas.chat_views import ChatRequest, ChatResponse


limiter = Limiter(key_func=get_remote_address)

router = APIRouter(prefix="/api/chat", tags=["chat"])

@router.post("", response_model=ChatResponse)
@limiter.limit("30/hour")
async def chat(data: ChatRequest, request: Request):
    return operation_response(await commands.chat(data=data, request=request))
