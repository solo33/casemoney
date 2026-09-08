from app.api.responses import operation_response
"""HTTP routes; application operations own validation and transaction boundaries."""
from fastapi import APIRouter, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.operations.support import commands
from app.schemas.support_views import SupportContactRequest, SupportContactResponse


limiter = Limiter(key_func=get_remote_address)

router = APIRouter(prefix="/api/support", tags=["support"])

@router.post("/contact", response_model=SupportContactResponse)
@limiter.limit("5/hour")
def contact_support(data: SupportContactRequest, request: Request):
    return operation_response(commands.contact_support(data=data, request=request))
