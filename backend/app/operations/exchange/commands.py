"""Exchange: commands. Callers supply resolved user and database session."""
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.services import exchange as exchange_svc



def refresh_rates(db: Session=None):
    """Принудительно обновить все ходовые курсы (CBR + CoinGecko)."""
    try:
        return exchange_svc.refresh_all_rates(db)
    except exchange_svc.ExchangeError as e:
        raise HTTPException(status_code=502, detail=str(e))
