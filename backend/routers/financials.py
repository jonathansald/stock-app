from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from database.db import get_db
from services import yfinance_service

router = APIRouter(prefix="/api/financials", tags=["financials"])


@router.get("/{ticker}/income")
async def get_income(
    ticker: str,
    period: str = Query("annual", pattern="^(annual|quarter)$"),
    limit: int = Query(5, le=10),
    db: Session = Depends(get_db),
):
    ticker = ticker.upper()
    data = await yfinance_service.get_income_statement(db, ticker, period, limit)
    return {"ticker": ticker, "period": period, "data": data}


@router.get("/{ticker}/balance")
async def get_balance(
    ticker: str,
    period: str = Query("annual", pattern="^(annual|quarter)$"),
    limit: int = Query(5, le=10),
    db: Session = Depends(get_db),
):
    ticker = ticker.upper()
    data = await yfinance_service.get_balance_sheet(db, ticker, period, limit)
    return {"ticker": ticker, "period": period, "data": data}


@router.get("/{ticker}/cashflow")
async def get_cashflow(
    ticker: str,
    period: str = Query("annual", pattern="^(annual|quarter)$"),
    limit: int = Query(5, le=10),
    db: Session = Depends(get_db),
):
    ticker = ticker.upper()
    data = await yfinance_service.get_cash_flow(db, ticker, period, limit)
    return {"ticker": ticker, "period": period, "data": data}
