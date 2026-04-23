from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database.db import get_db
from services import yfinance_service
from services.dcf_calculator import calculate_dcf, sensitivity_table
import numpy as np

router = APIRouter(prefix="/api/dcf", tags=["dcf"])


class DCFRequest(BaseModel):
    revenue_growth_rates: list[float]
    ebit_margin: float
    tax_rate: float = 0.21
    capex_pct: float = 0.05
    da_pct: float = 0.03
    wacc: float = 0.10
    terminal_growth_rate: float = 0.025
    shares_outstanding: float
    net_debt: float
    current_revenue: float
    current_price: float | None = None


@router.get("/{ticker}/comparables")
async def get_comparables(ticker: str, db: Session = Depends(get_db)):
    """Peer relative-valuation multiples and implied prices for a ticker."""
    ticker = ticker.upper()
    try:
        data = await yfinance_service.get_comparables_data(db, ticker)
        return data or {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{ticker}/prefill")
def get_prefill(ticker: str, db: Session = Depends(get_db)):
    ticker = ticker.upper()
    try:
        data = yfinance_service.get_dcf_prefill_sync(db, ticker)
        if not data.get("current_revenue"):
            raise HTTPException(status_code=404, detail=f"Could not load financial data for {ticker}.")
        return data
    except HTTPException:
        raise
    except BaseException as e:
        import traceback
        err = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
        raise HTTPException(status_code=400, detail=err)


@router.post("/{ticker}/calculate")
async def calculate(ticker: str, req: DCFRequest):
    ticker = ticker.upper()
    try:
        result = calculate_dcf(
            current_revenue=req.current_revenue,
            revenue_growth_rates=req.revenue_growth_rates,
            ebit_margin=req.ebit_margin,
            tax_rate=req.tax_rate,
            capex_pct=req.capex_pct,
            da_pct=req.da_pct,
            wacc=req.wacc,
            terminal_growth_rate=req.terminal_growth_rate,
            shares_outstanding=req.shares_outstanding,
            net_debt=req.net_debt,
        )

        margin_of_safety = None
        if req.current_price and req.current_price > 0:
            margin_of_safety = round(
                (result["intrinsic_value_per_share"] - req.current_price) / req.current_price, 4
            )

        wacc_range = list(np.arange(req.wacc - 0.02, req.wacc + 0.03, 0.01))
        tgr_range = list(np.arange(0.01, 0.04, 0.005))
        base_params = {
            "current_revenue": req.current_revenue,
            "revenue_growth_rates": req.revenue_growth_rates,
            "ebit_margin": req.ebit_margin,
            "tax_rate": req.tax_rate,
            "capex_pct": req.capex_pct,
            "da_pct": req.da_pct,
            "wacc": req.wacc,
            "terminal_growth_rate": req.terminal_growth_rate,
            "shares_outstanding": req.shares_outstanding,
            "net_debt": req.net_debt,
        }
        sens = sensitivity_table(base_params, wacc_range, tgr_range)

        return {
            **result,
            "ticker": ticker,
            "current_price": req.current_price,
            "margin_of_safety": margin_of_safety,
            "sensitivity_table": sens,
            "wacc_range": [round(w, 3) for w in wacc_range],
            "tgr_range": [round(t, 3) for t in tgr_range],
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
