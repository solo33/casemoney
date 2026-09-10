"""Exchange: commands. Callers supply resolved user and database session."""
from app.application import ApplicationError
from sqlalchemy.orm import Session
from app.services import exchange as exchange_svc



def refresh_rates(db: Session=None):
    """Принудительно обновить все ходовые курсы (CBR + CoinGecko)."""
    try:
        result = exchange_svc.refresh_all_rates(db)
        db.commit()
        exchange_svc.invalidate_user_rates()
        return result
    except exchange_svc.ExchangeError as e:
        raise ApplicationError(status_code=502, detail=str(e))
