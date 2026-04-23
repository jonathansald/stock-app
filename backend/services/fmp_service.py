import os
import asyncio
import httpx
from sqlalchemy.orm import Session
from cache.cache_manager import get_cached, set_cache
from cache.ttl_config import TTL

BASE_URL = "https://financialmodelingprep.com/api/v3"
BASE_URL_V4 = "https://financialmodelingprep.com/api/v4"


def _get_key() -> str:
    key = os.getenv("FMP_KEY", "")
    if not key:
        raise ValueError("FMP_KEY not set in .env")
    return key


async def screen_stocks(db: Session, filters: dict) -> list[dict]:
    filter_str = "_".join(f"{k}={v}" for k, v in sorted(filters.items()) if v is not None)
    cache_key = f"screener:{filter_str}"
    cached = get_cached(db, cache_key)
    if cached:
        return cached

    params = {"apikey": _get_key(), "limit": filters.get("limit", 50)}
    if filters.get("sector"):
        params["sector"] = filters["sector"]
    if filters.get("industry"):
        params["industry"] = filters["industry"]
    if filters.get("market_cap_more_than"):
        params["marketCapMoreThan"] = filters["market_cap_more_than"]
    if filters.get("market_cap_less_than"):
        params["marketCapLowerThan"] = filters["market_cap_less_than"]
    if filters.get("price_more_than"):
        params["priceMoreThan"] = filters["price_more_than"]
    if filters.get("price_less_than"):
        params["priceLowerThan"] = filters["price_less_than"]
    if filters.get("beta_more_than"):
        params["betaMoreThan"] = filters["beta_more_than"]
    if filters.get("beta_less_than"):
        params["betaLowerThan"] = filters["beta_less_than"]
    if filters.get("dividend_more_than"):
        params["dividendMoreThan"] = filters["dividend_more_than"]
    if filters.get("country"):
        params["country"] = filters.get("country", "US")
    if filters.get("exchange"):
        params["exchange"] = filters["exchange"]

    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE_URL}/stock-screener", params=params)
        r.raise_for_status()
        data = r.json()

    results = [
        {
            "ticker": item.get("symbol"),
            "name": item.get("companyName"),
            "sector": item.get("sector"),
            "industry": item.get("industry"),
            "price": item.get("price"),
            "market_cap": item.get("marketCap"),
            "beta": item.get("beta"),
            "volume": item.get("volume"),
            "exchange": item.get("exchangeShortName"),
            "country": item.get("country"),
        }
        for item in (data or [])
    ]
    set_cache(db, cache_key, results, TTL["screener"])
    return results


async def get_key_metrics(db: Session, ticker: str) -> dict:
    cache_key = f"metrics:{ticker}"
    cached = get_cached(db, cache_key)
    if cached:
        return cached

    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE_URL}/key-metrics-ttm/{ticker}", params={"apikey": _get_key()})
        r.raise_for_status()
        data = r.json()

    if not data:
        return {}

    m = data[0]
    result = {
        "pe_ratio": m.get("peRatioTTM"),
        "forward_pe": m.get("priceEarningsToGrowthRatioTTM"),
        "pb_ratio": m.get("pbRatioTTM"),
        "ps_ratio": m.get("priceToSalesRatioTTM"),
        "ev_ebitda": m.get("enterpriseValueOverEBITDATTM"),
        "roe": m.get("roeTTM"),
        "roa": m.get("returnOnAssetsTTM"),
        "debt_to_equity": m.get("debtToEquityTTM"),
        "current_ratio": m.get("currentRatioTTM"),
        "dividend_yield": m.get("dividendYieldTTM"),
        "earnings_yield": m.get("earningsYieldTTM"),
        "free_cash_flow_yield": m.get("freeCashFlowYieldTTM"),
        "revenue_per_share": m.get("revenuePerShareTTM"),
        "net_income_per_share": m.get("netIncomePerShareTTM"),
    }
    set_cache(db, cache_key, result, TTL["metrics"])
    return result


async def get_analyst_rating(db: Session, ticker: str) -> dict:
    cache_key = f"analyst_rating:{ticker}"
    cached = get_cached(db, cache_key)
    if cached:
        return cached

    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE_URL}/rating/{ticker}", params={"apikey": _get_key()})
        r.raise_for_status()
        data = r.json()

    if not data:
        return {}

    d = data[0] if isinstance(data, list) else data
    result = {
        "recommendation": d.get("ratingRecommendation"),
        "rating_score": d.get("ratingScore"),
    }
    set_cache(db, cache_key, result, TTL["analyst"])
    return result


async def get_price_targets(db: Session, ticker: str) -> dict:
    cache_key = f"price_targets:{ticker}"
    cached = get_cached(db, cache_key)
    if cached:
        return cached

    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE_URL}/price-target-consensus/{ticker}", params={"apikey": _get_key()})
        r.raise_for_status()
        data = r.json()

    if not data:
        return {}

    d = data[0] if isinstance(data, list) else data
    result = {
        "target_high": d.get("targetHigh"),
        "target_low": d.get("targetLow"),
        "target_consensus": d.get("targetConsensus"),
        "target_median": d.get("targetMedian"),
    }
    set_cache(db, cache_key, result, TTL["analyst"])
    return result


async def get_analyst_estimates(db: Session, ticker: str) -> list[dict]:
    cache_key = f"analyst_estimates:{ticker}"
    cached = get_cached(db, cache_key)
    if cached:
        return cached

    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BASE_URL}/analyst-estimates/{ticker}", params={"apikey": _get_key(), "limit": 8})
        r.raise_for_status()
        data = r.json()

    results = [
        {
            "date": item.get("date"),
            "estimated_revenue": item.get("estimatedRevenueAvg"),
            "estimated_eps": item.get("estimatedEpsAvg"),
            "estimated_eps_high": item.get("estimatedEpsHigh"),
            "estimated_eps_low": item.get("estimatedEpsLow"),
        }
        for item in (data or [])[:8]
    ]
    set_cache(db, cache_key, results, TTL["analyst"])
    return results


async def get_income_statement(db: Session, ticker: str, period: str = "annual", limit: int = 5) -> list[dict]:
    cache_key = f"financials:income:{ticker}:{period}"
    cached = get_cached(db, cache_key)
    if cached:
        return cached

    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{BASE_URL}/income-statement/{ticker}",
            params={"apikey": _get_key(), "period": period, "limit": limit},
        )
        r.raise_for_status()
        data = r.json()

    results = [
        {
            "date": item.get("date"),
            "period": item.get("period"),
            "revenue": item.get("revenue"),
            "gross_profit": item.get("grossProfit"),
            "gross_margin": item.get("grossProfitRatio"),
            "operating_income": item.get("operatingIncome"),
            "operating_margin": item.get("operatingIncomeRatio"),
            "net_income": item.get("netIncome"),
            "net_margin": item.get("netIncomeRatio"),
            "ebitda": item.get("ebitda"),
            "eps": item.get("eps"),
            "eps_diluted": item.get("epsdiluted"),
            "shares_outstanding": item.get("weightedAverageShsOutDil"),
            "rd_expenses": item.get("researchAndDevelopmentExpenses"),
            "sga_expenses": item.get("sellingGeneralAndAdministrativeExpenses"),
        }
        for item in (data or [])
    ]
    set_cache(db, cache_key, results, TTL["financials"])
    return results


async def get_balance_sheet(db: Session, ticker: str, period: str = "annual", limit: int = 5) -> list[dict]:
    cache_key = f"financials:balance:{ticker}:{period}"
    cached = get_cached(db, cache_key)
    if cached:
        return cached

    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{BASE_URL}/balance-sheet-statement/{ticker}",
            params={"apikey": _get_key(), "period": period, "limit": limit},
        )
        r.raise_for_status()
        data = r.json()

    results = [
        {
            "date": item.get("date"),
            "period": item.get("period"),
            "cash": item.get("cashAndCashEquivalents"),
            "total_current_assets": item.get("totalCurrentAssets"),
            "total_assets": item.get("totalAssets"),
            "total_current_liabilities": item.get("totalCurrentLiabilities"),
            "total_liabilities": item.get("totalLiabilities"),
            "total_equity": item.get("totalStockholdersEquity"),
            "total_debt": item.get("totalDebt"),
            "net_debt": item.get("netDebt"),
            "goodwill": item.get("goodwill"),
            "retained_earnings": item.get("retainedEarnings"),
        }
        for item in (data or [])
    ]
    set_cache(db, cache_key, results, TTL["financials"])
    return results


async def get_cash_flow(db: Session, ticker: str, period: str = "annual", limit: int = 5) -> list[dict]:
    cache_key = f"financials:cashflow:{ticker}:{period}"
    cached = get_cached(db, cache_key)
    if cached:
        return cached

    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{BASE_URL}/cash-flow-statement/{ticker}",
            params={"apikey": _get_key(), "period": period, "limit": limit},
        )
        r.raise_for_status()
        data = r.json()

    results = [
        {
            "date": item.get("date"),
            "period": item.get("period"),
            "operating_cash_flow": item.get("operatingCashFlow"),
            "investing_cash_flow": item.get("netCashUsedForInvestingActivites"),
            "financing_cash_flow": item.get("netCashUsedProvidedByFinancingActivities"),
            "free_cash_flow": item.get("freeCashFlow"),
            "capex": item.get("capitalExpenditure"),
            "dividends_paid": item.get("dividendsPaid"),
            "stock_repurchases": item.get("commonStockRepurchased"),
            "depreciation": item.get("depreciationAndAmortization"),
        }
        for item in (data or [])
    ]
    set_cache(db, cache_key, results, TTL["financials"])
    return results


async def get_comparables_data(db: Session, ticker: str) -> dict:
    """Fetch peer companies and their relative valuation multiples."""
    cache_key = f"comparables:{ticker}"
    cached = get_cached(db, cache_key)
    if cached:
        return cached

    key = _get_key()

    # 1. Fetch peer list
    peer_symbols: list[str] = []
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{BASE_URL_V4}/stock_peers",
                params={"symbol": ticker, "apikey": key},
            )
        if resp.status_code == 200 and resp.json():
            data = resp.json()
            if data and isinstance(data, list):
                peer_symbols = data[0].get("peersList", [])[:7]
    except Exception:
        pass

    all_symbols = [ticker] + peer_symbols

    # 2. Fetch key-metrics-ttm + profile concurrently for every symbol
    async def _fetch_company(sym: str) -> dict:
        company: dict = {"symbol": sym}
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                km_resp, prof_resp = await asyncio.gather(
                    client.get(f"{BASE_URL}/key-metrics-ttm/{sym}", params={"apikey": key}),
                    client.get(f"{BASE_URL}/profile/{sym}", params={"apikey": key}),
                )
            if km_resp.status_code == 200 and km_resp.json():
                m = km_resp.json()[0]
                company.update({
                    "pe_ratio":            _clean(m.get("peRatioTTM"),          200),
                    "pb_ratio":            _clean(m.get("pbRatioTTM"),           50),
                    "ps_ratio":            _clean(m.get("priceToSalesRatioTTM"), 100),
                    "ev_ebitda":           _clean(m.get("enterpriseValueOverEBITDATTM"), 200),
                    "ev_sales":            _clean(m.get("evToSalesTTM"),          100),
                    "roe":                 m.get("roeTTM"),
                    "eps":                 m.get("netIncomePerShareTTM"),
                    "revenue_per_share":   m.get("revenuePerShareTTM"),
                    "book_value_per_share":m.get("bookValuePerShareTTM"),
                    "fcf_yield":           m.get("freeCashFlowYieldTTM"),
                    "dividend_yield":      m.get("dividendYieldTTM"),
                    "market_cap":          m.get("marketCapTTM"),
                })
            if prof_resp.status_code == 200 and prof_resp.json():
                p = prof_resp.json()[0]
                company.update({
                    "name":     p.get("companyName", sym),
                    "sector":   p.get("sector", ""),
                    "industry": p.get("industry", ""),
                    "price":    p.get("price"),
                    "market_cap": p.get("mktCap") or company.get("market_cap"),
                    "beta":     p.get("beta"),
                })
        except Exception:
            pass
        return company

    companies = list(await asyncio.gather(*[_fetch_company(s) for s in all_symbols]))

    if not companies:
        return {}

    target = companies[0]
    peers  = companies[1:]

    # 3. Compute peer median multiples (filter outliers)
    def _median(vals: list, max_val: float = 500) -> float | None:
        clean = [v for v in vals if v and isinstance(v, (int, float)) and 0 < v < max_val]
        if not clean:
            return None
        clean.sort()
        n = len(clean)
        return round(clean[n // 2] if n % 2 == 1 else (clean[n // 2 - 1] + clean[n // 2]) / 2, 2)

    peer_medians = {
        "pe":       _median([c.get("pe_ratio")  for c in peers], 200),
        "pb":       _median([c.get("pb_ratio")  for c in peers],  50),
        "ps":       _median([c.get("ps_ratio")  for c in peers], 100),
        "ev_ebitda":_median([c.get("ev_ebitda") for c in peers], 200),
        "ev_sales": _median([c.get("ev_sales")  for c in peers], 100),
    }

    # 4. Implied price calculations using target fundamentals
    cur = target.get("price") or 0

    def _implied(multiple, metric_val, multiple_name: str, metric_label: str):
        if not multiple or not metric_val or metric_val <= 0:
            return None
        implied = round(multiple * metric_val, 2)
        upside  = round((implied / cur - 1) * 100, 1) if cur > 0 else None
        return {
            "multiple_name": multiple_name,
            "multiple":      round(multiple, 2),
            "metric_label":  metric_label,
            "metric_value":  round(metric_val, 2),
            "implied_price": implied,
            "upside_pct":    upside,
        }

    implied_prices = {}
    if e := _implied(peer_medians["pe"], target.get("eps"),               "P/E",       "EPS (TTM)"):
        implied_prices["pe"] = e
    if e := _implied(peer_medians["ps"], target.get("revenue_per_share"), "P/S",       "Revenue / Share"):
        implied_prices["ps"] = e
    if e := _implied(peer_medians["pb"], target.get("book_value_per_share"), "P/B",    "Book Value / Share"):
        implied_prices["pb"] = e

    vals = [v["implied_price"] for v in implied_prices.values() if v]
    composite = round(sum(vals) / len(vals), 2) if vals else None

    result = {
        "target":           target,
        "peers":            peers,
        "peer_medians":     peer_medians,
        "implied_prices":   implied_prices,
        "composite_implied":composite,
        "current_price":    target.get("price"),
    }
    set_cache(db, cache_key, result, TTL["comparables"])
    return result


def _clean(val, max_val: float) -> float | None:
    """Return val only if it is a sensible positive number below max_val."""
    if val and isinstance(val, (int, float)) and 0 < val < max_val:
        return val
    return None


async def get_dcf_prefill(db: Session, ticker: str) -> dict:
    cache_key = f"dcf_prefill:{ticker}"
    cached = get_cached(db, cache_key)
    if cached:
        return cached

    from services import yfinance_service
    income_data = await yfinance_service.get_income_statement(db, ticker, "annual", 5)
    balance_data = await yfinance_service.get_balance_sheet(db, ticker, "annual", 1)
    cashflow_data = await yfinance_service.get_cash_flow(db, ticker, "annual", 5)

    revenues = [d["revenue"] for d in income_data if d.get("revenue")]
    growth_rates = []
    for i in range(1, len(revenues)):
        if revenues[i] and revenues[i - 1]:
            growth_rates.append((revenues[i - 1] - revenues[i]) / revenues[i])

    avg_growth = sum(growth_rates) / len(growth_rates) if growth_rates else 0.08
    avg_margin = (
        sum(d["net_margin"] for d in income_data if d.get("net_margin")) / len(income_data)
        if income_data else 0.1
    )

    latest_balance = balance_data[0] if balance_data else {}
    latest_income = income_data[0] if income_data else {}
    latest_cf = cashflow_data[0] if cashflow_data else {}

    result = {
        "ticker": ticker,
        "revenue_growth_suggestion": round(avg_growth, 4),
        "ebit_margin_suggestion": round(avg_margin, 4),
        "current_revenue": latest_income.get("revenue"),
        "shares_outstanding": latest_income.get("shares_outstanding"),
        "net_debt": latest_balance.get("net_debt"),
        "capex_pct_suggestion": (
            abs(latest_cf.get("capex", 0) or 0) / latest_income.get("revenue", 1)
            if latest_income.get("revenue") else 0.05
        ),
        "historical_revenues": [
            {"date": d["date"], "revenue": d["revenue"]} for d in income_data
        ],
        "historical_growth_rates": growth_rates,
    }
    set_cache(db, cache_key, result, TTL["dcf_prefill"])
    return result
