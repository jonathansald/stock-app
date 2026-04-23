from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from database.db import get_db
from services import yfinance_service

router = APIRouter(prefix="/api/stocks", tags=["stocks"])


@router.get("/{ticker}/quote")
async def get_quote(ticker: str, db: Session = Depends(get_db)):
    ticker = ticker.upper()
    data = await yfinance_service.get_quote(db, ticker)
    if not data.get("price"):
        raise HTTPException(status_code=404, detail=f"No quote found for {ticker}")
    return data


@router.get("/{ticker}/profile")
async def get_profile(ticker: str, db: Session = Depends(get_db)):
    ticker = ticker.upper()
    data = await yfinance_service.get_profile(db, ticker)
    if not data.get("name"):
        raise HTTPException(status_code=404, detail=f"No profile found for {ticker}")
    return data


@router.get("/{ticker}/history")
async def get_history(
    ticker: str,
    period: str = Query("1y", pattern="^(1d|5d|1mo|3mo|6mo|1y|2y|5y|10y|ytd|max)$"),
    db: Session = Depends(get_db),
):
    ticker = ticker.upper()
    data = await yfinance_service.get_historical_prices(db, ticker, period)
    if not data:
        raise HTTPException(status_code=404, detail=f"No history found for {ticker}")
    return {"ticker": ticker, "period": period, "data": data}


@router.get("/{ticker}/metrics")
async def get_metrics(ticker: str, db: Session = Depends(get_db)):
    ticker = ticker.upper()
    data = await yfinance_service.get_metrics(db, ticker)
    return data


@router.get("/{ticker}/analyst")
async def get_analyst(ticker: str, db: Session = Depends(get_db)):
    ticker = ticker.upper()
    data = await yfinance_service.get_analyst(db, ticker)
    return data
