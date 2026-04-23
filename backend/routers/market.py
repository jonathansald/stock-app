import os
import asyncio
import yfinance as yf
import pandas as pd
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from database.db import get_db
from cache.cache_manager import get_cached, set_cache
from cache.ttl_config import TTL

router = APIRouter(prefix="/api/market", tags=["market"])

# All tracked instruments: (yfinance symbol, display name, category)
_SYMBOLS = [
    # Major indexes
    ("^GSPC",     "S&P 500",             "indexes"),
    ("^IXIC",     "NASDAQ",              "indexes"),
    ("^DJI",      "Dow Jones",           "indexes"),
    ("^RUT",      "Russell 2000",        "indexes"),
    ("^VIX",      "VIX",                 "indexes"),
    # Commodities
    ("GC=F",      "Gold",                "commodities"),
    ("CL=F",      "Crude Oil (WTI)",     "commodities"),
    ("SI=F",      "Silver",              "commodities"),
    ("NG=F",      "Natural Gas",         "commodities"),
    ("HG=F",      "Copper",              "commodities"),
    ("ZC=F",      "Corn",                "commodities"),
    ("ZW=F",      "Wheat",               "commodities"),
    # US Treasury yields (× 100 in yfinance = %)
    ("^TNX",      "10Y Treasury",        "rates"),
    ("^TYX",      "30Y Treasury",        "rates"),
    ("^FVX",      "5Y Treasury",         "rates"),
    ("^IRX",      "3M T-Bill",           "rates"),
    # Crypto
    ("BTC-USD",   "Bitcoin",             "crypto"),
    ("ETH-USD",   "Ethereum",            "crypto"),
    ("SOL-USD",   "Solana",              "crypto"),
    ("BNB-USD",   "BNB",                 "crypto"),
    # Forex
    ("EURUSD=X",  "EUR / USD",           "forex"),
    ("GBPUSD=X",  "GBP / USD",           "forex"),
    ("USDJPY=X",  "USD / JPY",           "forex"),
    ("USDCHF=X",  "USD / CHF",           "forex"),
    ("DX-Y.NYB",  "USD Index (DXY)",     "forex"),
]

_RATE_SYMBOLS = {"^TNX", "^TYX", "^FVX", "^IRX"}   # already in percent


@router.get("/overview")
async def get_market_overview(db: Session = Depends(get_db)):
    """Returns prices + day change for all tracked instruments grouped by category."""
    cache_key = "market:overview"
    cached = get_cached(db, cache_key)
    if cached:
        return cached

    symbols = [s[0] for s in _SYMBOLS]
    close_df = pd.DataFrame()

    try:
        raw = yf.download(
            " ".join(symbols),
            period="5d",
            interval="1d",
            progress=False,
            auto_adjust=True,
        )
        if isinstance(raw.columns, pd.MultiIndex):
            close_df = raw["Close"]
        else:
            # Single ticker — shouldn't happen but guard anyway
            close_df = raw[["Close"]].rename(columns={"Close": symbols[0]})

        close_df = close_df.dropna(how="all")
    except Exception:
        pass

    result: dict[str, list] = {}

    for sym, name, cat in _SYMBOLS:
        price = change = change_pct = None
        try:
            if sym in close_df.columns:
                col = close_df[sym].dropna()
                if len(col) >= 2:
                    cur  = float(col.iloc[-1])
                    prev = float(col.iloc[-2])
                    price      = cur
                    change     = round(cur - prev, 6)
                    change_pct = round((change / prev) * 100, 4)
                elif len(col) == 1:
                    price = float(col.iloc[-1])
        except Exception:
            pass

        if cat not in result:
            result[cat] = []

        # Rates are expressed as yields (e.g. 4.35), not raw prices
        display_price = round(price, 4) if price is not None else None

        result[cat].append({
            "symbol":     sym,
            "name":       name,
            "price":      display_price,
            "change":     round(change, 4) if change is not None else None,
            "change_pct": change_pct,
            "is_rate":    sym in _RATE_SYMBOLS,
        })

    set_cache(db, cache_key, result, TTL["quote"])
    return result


@router.get("/history")
async def get_market_symbol_history(
    symbol: str = Query(..., description="yfinance symbol, e.g. ^GSPC, GC=F, BTC-USD"),
    period: str = Query("1y", pattern="^(1d|5d|1mo|3mo|6mo|1y|2y|5y|10y|ytd|max)$"),
    db: Session = Depends(get_db),
):
    """Historical OHLCV for any yfinance-compatible symbol (indexes, ETFs, crypto, forex, futures)."""
    from services import yfinance_service
    data = await yfinance_service.get_historical_prices(db, symbol, period)
    if not data:
        raise HTTPException(status_code=404, detail=f"No history found for {symbol}")
    return {"symbol": symbol, "period": period, "data": data}


@router.get("/ai-summary")
async def get_ai_market_summary(db: Session = Depends(get_db)):
    """AI-generated market brief for today using news headlines + index moves."""
    cache_key = "market:ai_summary"
    cached = get_cached(db, cache_key)
    if cached:
        return cached

    anthropic_key = os.getenv("ANTHROPIC_API_KEY")
    if not anthropic_key:
        result = {
            "summary": None,
            "error": "Add ANTHROPIC_API_KEY=sk-ant-... to backend/.env to enable the AI market brief.",
        }
        return result

    # --- gather context: headlines + index moves ---
    headlines = ""
    try:
        import httpx
        finnhub_key = os.getenv("FINNHUB_KEY", "")
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://finnhub.io/api/v1/news",
                params={"category": "general", "minId": 0, "token": finnhub_key},
            )
        if resp.status_code == 200:
            items = resp.json()[:15]
            headlines = "\n".join(
                f"- {n.get('headline', '')}" for n in items if n.get("headline")
            )
    except Exception:
        pass

    market_context = ""
    try:
        overview = get_cached(db, "market:overview") or {}
        idx_list = overview.get("indexes", [])
        market_context = "  ".join(
            f"{i['name']} {'+' if (i.get('change_pct') or 0) >= 0 else ''}{(i.get('change_pct') or 0):.1f}%"
            for i in idx_list
            if i.get("change_pct") is not None
        )
    except Exception:
        pass

    prompt = (
        "You are a professional market analyst writing a concise morning/evening market brief.\n\n"
        f"Today's major index moves: {market_context or 'data unavailable'}\n\n"
        f"Today's top market headlines:\n{headlines or 'No headlines available.'}\n\n"
        "Write a 3-5 sentence briefing explaining the key driver(s) of today's market action. "
        "Be specific — name companies, data releases, or macro events that mattered. "
        "Use clear, professional language without bullet points. "
        "Start directly with what happened — do NOT begin with 'Today' or 'The market'."
    )

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=anthropic_key)
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=350,
            messages=[{"role": "user", "content": prompt}],
        )
        summary_text = message.content[0].text
        result = {"summary": summary_text, "error": None, "headlines_used": bool(headlines)}
    except Exception as e:
        result = {"summary": None, "error": f"AI generation failed: {str(e)}"}

    set_cache(db, cache_key, result, TTL["news"])
    return result
