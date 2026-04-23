import asyncio
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from database.db import get_db
from services import fmp_service, finnhub_service, yfinance_service
from data.stocks_data import STOCKS

router = APIRouter(prefix="/api/screener", tags=["screener"])

# Deduplicate STOCKS by ticker (keep first occurrence)
_seen: set[str] = set()
_STOCKS: list[dict] = []
for _s in STOCKS:
    if _s["ticker"] not in _seen:
        _seen.add(_s["ticker"])
        _STOCKS.append(_s)
STOCKS = _STOCKS

# Build sector/industry lists from the static dataset
_sector_set: dict[str, set] = {}
for s in STOCKS:
    _sector_set.setdefault(s["sector"], set()).add(s["industry"])

SECTORS = sorted(_sector_set.keys())
INDUSTRIES = {sec: sorted(industries) for sec, industries in _sector_set.items()}


@router.get("/sectors")
async def get_sectors():
    return {"sectors": SECTORS, "industries": INDUSTRIES}


@router.get("/search")
async def search_symbols(
    q: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
):
    results = await finnhub_service.search_symbols(db, q)
    return {"results": results}


@router.get("/stocks")
async def screen_stocks(
    sector: str | None = None,
    industry: str | None = None,
    market_cap_more_than: float | None = None,
    market_cap_less_than: float | None = None,
    price_more_than: float | None = None,
    price_less_than: float | None = None,
    beta_more_than: float | None = None,
    beta_less_than: float | None = None,
    dividend_more_than: float | None = None,
    limit: int = Query(50, le=100),
    db: Session = Depends(get_db),
):
    # 1. Filter static dataset (market_cap, beta, dividend use approximate static values)
    candidates = STOCKS

    if sector:
        candidates = [s for s in candidates if s["sector"].lower() == sector.lower()]
    if industry:
        candidates = [s for s in candidates if s["industry"].lower() == industry.lower()]
    if market_cap_more_than is not None:
        candidates = [s for s in candidates if (s["market_cap"] or 0) >= market_cap_more_than]
    if market_cap_less_than is not None:
        candidates = [s for s in candidates if (s["market_cap"] or 0) <= market_cap_less_than]
    if beta_less_than is not None:
        candidates = [s for s in candidates if (s["beta"] or 0) <= beta_less_than]
    if beta_more_than is not None:
        candidates = [s for s in candidates if (s["beta"] or 0) >= beta_more_than]
    if dividend_more_than is not None:
        # dividend_more_than is a percentage (e.g. 2.0), stored as fraction (0.02)
        threshold = dividend_more_than / 100.0
        candidates = [s for s in candidates if (s["dividend_yield"] or 0) >= threshold]

    candidates = candidates[:limit]

    if not candidates:
        return {"stocks": [], "count": 0}

    # 2. Fetch real-time prices from yfinance (one batch call)
    tickers = [s["ticker"] for s in candidates]
    prices = await yfinance_service.get_batch_prices(tickers)

    # 3. Build results, applying price filter on real-time prices
    results = []
    for stock in candidates:
        price = prices.get(stock["ticker"])

        if price_more_than is not None and (price is None or price < price_more_than):
            continue
        if price_less_than is not None and (price is None or price > price_less_than):
            continue

        results.append({
            "ticker": stock["ticker"],
            "name": stock["name"],
            "sector": stock["sector"],
            "industry": stock["industry"],
            "price": round(price, 2) if price else None,
            "market_cap": stock["market_cap"],
            "beta": stock["beta"],
            "volume": None,
            "exchange": stock["exchange"],
            "country": "US",
        })

    return {"stocks": results, "count": len(results)}


@router.get("/analyst-batch")
async def get_analyst_batch(
    tickers: str = Query(..., description="Comma-separated list of tickers, max 20"),
    db: Session = Depends(get_db),
):
    ticker_list = [t.strip().upper() for t in tickers.split(",") if t.strip()][:20]

    async def fetch_one(ticker: str):
        try:
            rating, targets = await asyncio.gather(
                fmp_service.get_analyst_rating(db, ticker),
                fmp_service.get_price_targets(db, ticker),
            )
            return ticker, {**rating, **targets}
        except Exception:
            return ticker, {}

    pairs = await asyncio.gather(*[fetch_one(t) for t in ticker_list])
    return {"data": dict(pairs)}


@router.get("/earnings-batch")
async def get_earnings_batch(
    tickers: str = Query(..., description="Comma-separated list of tickers, max 20"),
    db: Session = Depends(get_db),
):
    """Return next earnings date for each ticker."""
    from cache.cache_manager import get_cached, set_cache
    from cache.ttl_config import TTL

    ticker_list = [t.strip().upper() for t in tickers.split(",") if t.strip()][:20]

    def _fetch_earnings(ticker: str) -> tuple[str, str | None]:
        cache_key = f"earnings_date:{ticker}"
        cached = get_cached(db, cache_key)
        if cached is not None:
            return ticker, cached.get("date")
        try:
            import yfinance as yf
            stock = yf.Ticker(ticker)
            cal = stock.calendar
            date_val = None
            if cal is not None:
                # calendar may be a dict or DataFrame depending on yfinance version
                if isinstance(cal, dict):
                    ed = cal.get("Earnings Date")
                    if isinstance(ed, list) and ed:
                        date_val = str(ed[0])[:10]
                    elif ed is not None:
                        date_val = str(ed)[:10]
                else:
                    # DataFrame — look for "Earnings Date" column
                    import pandas as pd
                    if "Earnings Date" in cal.columns:
                        vals = cal["Earnings Date"].dropna()
                        if not vals.empty:
                            date_val = str(vals.iloc[0])[:10]
            set_cache(db, cache_key, {"date": date_val}, TTL["earnings"])
            return ticker, date_val
        except Exception:
            return ticker, None

    loop = asyncio.get_event_loop()
    tasks = [loop.run_in_executor(None, _fetch_earnings, t) for t in ticker_list]
    results = await asyncio.gather(*tasks)
    return {"data": {t: d for t, d in results}}
