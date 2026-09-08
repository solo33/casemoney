"""Framework-independent operation results and infrastructure interfaces."""
from dataclasses import dataclass, field
from typing import Any, Callable, Iterable, Mapping, Protocol


class ApplicationError(Exception):
    def __init__(self, status_code: int, detail: Any = None, headers: Mapping[str, str] | None = None):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail
        self.headers = headers


@dataclass
class ResponseData:
    content: Any = None
    status_code: int = 200
    headers: Mapping[str, str] = field(default_factory=dict)
    media_type: str | None = None


@dataclass
class StreamData(ResponseData):
    content: Iterable[bytes | str] = ()


class RequestContext(Protocol):
    headers: Mapping[str, str]
    client: Any
    base_url: Any

    async def json(self) -> Any: ...


class TaskScheduler(Protocol):
    def add_task(self, function: Callable[..., Any], *args: Any, **kwargs: Any) -> None: ...


class UploadedFile(Protocol):
    filename: str | None

    async def read(self, size: int = -1) -> bytes: ...
