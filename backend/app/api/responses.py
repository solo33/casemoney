"""Translate application errors and downloads at the HTTP boundary."""
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse, Response, StreamingResponse
from app.application import ApplicationError, ResponseData, StreamData


def operation_response(result):
    if isinstance(result, ResponseData):
        response_type = StreamingResponse if isinstance(result, StreamData) else Response
        return response_type(result.content, status_code=result.status_code, headers=dict(result.headers), media_type=result.media_type)
    return result


async def application_error_response(request, exc: ApplicationError):
    return JSONResponse(status_code=exc.status_code, content={"detail": jsonable_encoder(exc.detail)}, headers=exc.headers)
