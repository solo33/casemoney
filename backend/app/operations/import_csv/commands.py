"""Import_csv: commands. Callers supply resolved user and database session."""
from app.operations.import_csv.common import MAX_IMPORT_BYTES
from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session
from app.services import import_csv as svc
from app.services import tbank_import as tbank_svc
from app.services.import_sessions import save_preview, claim_preview, decode_tbank
from app.schemas.import_csv import ConfirmResponse, ImportTotals
from app.schemas.import_csv_views import ConfirmRequest, PreviewResponseWithToken, TBankConfirmRequest


async def preview(file: UploadFile=..., db: Session=None, user_id: int=None):
    content = await file.read()
    if len(content) > MAX_IMPORT_BYTES:
        raise HTTPException(status_code=413, detail="Файл слишком большой. Максимум 10 МБ.")
    try:
        rows = svc.parse_file(file.filename or "", content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not rows:
        raise HTTPException(status_code=400, detail="Файл пустой или не содержит данных")

    preview = svc.build_preview(db, user_id, rows)

    token = save_preview(db, user_id, "file", rows)

    return PreviewResponseWithToken(
        import_token=token,
        rows=[
            {
                "line_no": r.line_no,
                "date": r.date,
                "account": r.account,
                "category_path": r.category_path,
                "amount": r.amount,
                "abs_amount": r.abs_amount,
                "currency": r.currency,
                "description": r.description,
                "transfer_to": r.transfer_to,
                "tx_type": r.tx_type,
                "error": r.error,
            }
            for r in preview.rows
        ],
        new_accounts=preview.new_accounts,
        existing_accounts=preview.existing_accounts,
        new_categories=preview.new_categories,
        existing_categories=preview.existing_categories,
        currencies_to_add=preview.currencies_to_add,
        totals=ImportTotals(**preview.totals),
    )


def confirm(data: ConfirmRequest, db: Session=None, user_id: int=None):
    session = claim_preview(db, user_id, "file", data.import_token, {})
    if session.result is not None:
        return ConfirmResponse(**session.result)
    rows = [svc.ParsedRow(**row) for row in session.payload]
    result = svc.execute_import(db, user_id, rows, commit=False)
    session.result, session.confirmation = result, {}
    db.commit()
    return ConfirmResponse(**result)


async def preview_tbank(file: UploadFile=..., db: Session=None, user_id: int=None):
    content = await file.read()
    if len(content) > MAX_IMPORT_BYTES:
        raise HTTPException(
            status_code=413,
            detail="Файл слишком большой. Максимум 10 МБ.",
        )
    try:
        items = tbank_svc.prepare_tbank_items(content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not items:
        raise HTTPException(
            status_code=400,
            detail="Файл пустой или не содержит операций",
        )
    if len(items) > 5000:
        raise HTTPException(
            status_code=400,
            detail="В одном файле можно импортировать не более 5000 операций",
        )

    result = tbank_svc.build_tbank_preview(db, user_id, items)
    token = save_preview(db, user_id, "tbank", items)
    result["import_token"] = token
    return result


def confirm_tbank(data: TBankConfirmRequest, db: Session=None, user_id: int=None):
    confirmation = data.model_dump(exclude={"import_token"})
    session = claim_preview(db, user_id, "tbank", data.import_token, confirmation)
    if session.result is not None:
        return session.result
    items = decode_tbank(session.payload, tbank_svc.TBankItem)

    try:
        result = tbank_svc.execute_tbank_import(
            db,
            user_id,
            items,
            data.account_mappings,
            data.category_mappings,
            commit=False,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    session.result, session.confirmation = result, confirmation
    db.commit()
    return result
