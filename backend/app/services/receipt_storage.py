"""Private file storage for receipts.

The API never exposes this directory as static content. Deployment mounts the
directory as persistent storage and files are returned only after ownership is
checked in the receipts router.
"""
import os
from pathlib import Path
from uuid import uuid4


ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
ALLOWED_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".pdf"}
MAX_RECEIPT_SIZE = int(os.getenv("RECEIPT_MAX_UPLOAD_BYTES", str(10 * 1024 * 1024)))


def receipt_upload_dir() -> Path:
    configured = os.getenv("RECEIPT_UPLOAD_DIR")
    # Docker passes /app/data/receipts explicitly.  For a local launch keep
    # uploads inside backend/ so development does not attempt to write to an
    # absolute /app directory on the host machine.
    result = (
        Path(configured).expanduser().resolve()
        if configured
        else (Path(__file__).resolve().parents[2] / "uploads" / "receipts")
    )
    result.mkdir(parents=True, exist_ok=True)
    return result


def build_storage_key(filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise ValueError("Можно загрузить изображение JPG, PNG, WEBP или файл PDF")
    return f"{uuid4().hex}{suffix}"


def file_path(storage_key: str) -> Path:
    # Storage keys are generated internally, still guard against traversal if a
    # corrupted database row ever appears.
    candidate = (receipt_upload_dir() / storage_key).resolve()
    if candidate.parent != receipt_upload_dir():
        raise ValueError("Некорректное имя файла")
    return candidate


def delete_file(storage_key: str) -> None:
    try:
        file_path(storage_key).unlink(missing_ok=True)
    except OSError:
        # A dangling file is less harmful than failing an already completed DB
        # delete. It can be cleaned up later by storage maintenance.
        pass
