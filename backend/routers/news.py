from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from database.db import get_db
from services import yfinance_service

router = APIRouter(prefix="/api/news", tags=["news"])


@router.get("/market")
async def get_market_news(db: Session = Depends(get_db)):
    # Use SPY as market proxy for general news
    data = await yfinance_service.get_news(db, "SPY", limit=12)
    return {"articles": data}


@router.get("/{ticker}")
async def get_company_news(
    ticker: str,
    limit: int = Query(20, le=50),
    db: Session = Depends(get_db),
):
    ticker = ticker.upper()
    data = await yfinance_service.get_news(db, ticker, limit=limit)
    return {"ticker": ticker, "articles": data}
