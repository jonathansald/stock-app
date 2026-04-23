from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.portfolio_optimizer import optimize_portfolio, get_correlation_matrix

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


class OptimizeRequest(BaseModel):
    tickers: list[str]
    risk_profile: str = "moderate"
    period: str = "2y"
    min_weight: float = 0.0   # minimum allocation per stock (0–0.5)
    max_weight: float = 0.4   # maximum allocation per stock (0.1–1.0)


@router.post("/optimize")
async def optimize(req: OptimizeRequest):
    if len(req.tickers) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 tickers")
    if len(req.tickers) > 20:
        raise HTTPException(status_code=400, detail="Maximum 20 tickers")
    if req.risk_profile not in ("conservative", "moderate", "aggressive"):
        raise HTTPException(status_code=400, detail="risk_profile must be conservative, moderate, or aggressive")

    min_w = max(0.0, min(req.min_weight, 0.5))
    max_w = max(0.1, min(req.max_weight, 1.0))
    n = len(req.tickers)
    # Guard: if min_w * n > 1 the problem is infeasible, relax automatically
    if min_w * n > 0.99:
        min_w = round(0.95 / n, 4)

    tickers = [t.upper() for t in req.tickers]
    try:
        result = await optimize_portfolio(tickers, req.risk_profile, req.period, min_w, max_w)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Optimization failed: {str(e)}")


@router.get("/correlation")
async def correlation(tickers: str, period: str = "1y"):
    ticker_list = [t.strip().upper() for t in tickers.split(",")]
    if len(ticker_list) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 tickers")
    result = await get_correlation_matrix(ticker_list, period)
    return result
