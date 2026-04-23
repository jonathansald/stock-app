import os
import httpx
from sqlalchemy.orm import Session
from cache.cache_manager import get_cached, set_cache
from cache.ttl_config import TTL

BASE_URL = "https://finnhub.io/api/v1"


def _get_key() -> str:
    key = os.getenv("FINNHUB_KEY", "")
    if not key:
        raise ValueError("FINNHUB_KEY not set in .env")
    return key


async def get_quote(db: Session, ticker: str) -> dict:
    cache_key = f"quote:{ticker}"
    cached = get_cached(db, cache_key)
    if cached:
        return cached

    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE_URL}/quote", params={"symbol": ticker, "token": _get_key()})
        r.raise_for_status()
        data = r.json()

    result = {
        "ticker": ticker,
        "price": data.get("c"),
        "change": data.get("d"),
        "change_pct": data.get("dp"),
        "high": data.get("h"),
        "low": data.get("l"),
        "open": data.get("o"),
        "prev_close": data.get("pc"),
        "volume": data.get("t"),
    }
    set_cache(db, cache_key, result, TTL["quote"])
    return result


async def get_company_profile(db: Session, ticker: str) -> dict:
    cache_key = f"profile:{ticker}"
    cached = get_cached(db, cache_key)
    if cached:
        return cached

    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE_URL}/stock/profile2", params={"symbol": ticker, "token": _get_key()})
        r.raise_for_status()
        data = r.json()

    result = {
        "ticker": ticker,
        "name": data.get("name"),
        "exchange": data.get("exchange"),
        "sector": data.get("finnhubIndustry"),
        "country": data.get("country"),
        "currency": data.get("currency"),
        "logo": data.get("logo"),
        "website": data.get("weburl"),
        "market_cap": data.get("marketCapitalization"),
        "shares_outstanding": data.get("shareOutstanding"),
        "ipo_date": data.get("ipo"),
    }
    set_cache(db, cache_key, result, TTL["profile"])
    return result


async def search_symbols(db: Session, query: str) -> list[dict]:
    cache_key = f"search:{query.lower()}"
    cached = get_cached(db, cache_key)
    if cached:
        return cached

    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE_URL}/search", params={"q": query, "token": _get_key()})
        r.raise_for_status()
        data = r.json()

    results = [
        {"ticker": item["symbol"], "name": item["description"], "type": item["type"]}
        for item in data.get("result", [])
        if item.get("type") == "Common Stock" and "." not in item["symbol"]
    ][:10]
    set_cache(db, cache_key, results, TTL["search"])
    return results


async def get_recommendation_trends(db: Session, ticker: str) -> dict:
    cache_key = f"analyst_trends:{ticker}"
    cached = get_cached(db, cache_key)
    if cached:
        return cached

    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE_URL}/stock/recommendation", params={"symbol": ticker, "token": _get_key()})
        r.raise_for_status()
        data = r.json()

    if not data:
        return {}

    latest = data[0]
    result = {
        "period": latest.get("period"),
        "strong_buy": latest.get("strongBuy", 0),
        "buy": latest.get("buy", 0),
        "hold": latest.get("hold", 0),
        "sell": latest.get("sell", 0),
        "strong_sell": latest.get("strongSell", 0),
    }
    set_cache(db, cache_key, result, TTL["analyst"])
    return result


async def get_company_news(db: Session, ticker: str, from_date: str, to_date: str) -> list[dict]:
    cache_key = f"news:{ticker}:{from_date}"
    cached = get_cached(db, cache_key)
    if cached:
        return cached

    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{BASE_URL}/company-news",
            params={"symbol": ticker, "from": from_date, "to": to_date, "token": _get_key()},
        )
        r.raise_for_status()
        data = r.json()

    results = [
        {
            "headline": item.get("headline"),
            "summary": item.get("summary"),
            "source": item.get("source"),
            "url": item.get("url"),
            "image": item.get("image"),
            "published_at": item.get("datetime"),
            "sentiment": item.get("sentiment"),
        }
        for item in (data or [])[:20]
    ]
    set_cache(db, cache_key, results, TTL["news"])
    return results


async def get_market_news(db: Session) -> list[dict]:
    cache_key = "news:market"
    cached = get_cached(db, cache_key)
    if cached:
        return cached

    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE_URL}/news", params={"category": "general", "token": _get_key()})
        r.raise_for_status()
        data = r.json()

    results = [
        {
            "headline": item.get("headline"),
            "summary": item.get("summary"),
            "source": item.get("source"),
            "url": item.get("url"),
            "image": item.get("image"),
            "published_at": item.get("datetime"),
        }
        for item in (data or [])[:12]
    ]
    set_cache(db, cache_key, results, TTL["news"])
    return results
