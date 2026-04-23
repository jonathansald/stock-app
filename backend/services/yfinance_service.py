import asyncio
import yfinance as yf
import pandas as pd
from sqlalchemy.orm import Session
from cache.cache_manager import get_cached, set_cache
from cache.ttl_config import TTL


def _period_to_interval(period: str) -> str:
    return {"1d": "5m", "5d": "15m"}.get(period, "1d")


async def get_historical_prices(db: Session, ticker: str, period: str = "1y") -> list[dict]:
    cache_key = f"history:{ticker}:{period}"
    cached = get_cached(db, cache_key)
    if cached:
        return cached

    interval = _period_to_interval(period)
    stock = yf.Ticker(ticker)
    hist = stock.history(period=period, interval=interval)

    if hist.empty:
        return []

    is_intraday = interval != "1d"
    results = []
    for idx, row in hist.iterrows():
        if is_intraday:
            # lightweight-charts needs Unix timestamp (seconds) for intraday
            ts = int(idx.timestamp())
            results.append({
                "date": ts,
                "open": round(float(row["Open"]), 4),
                "high": round(float(row["High"]), 4),
                "low": round(float(row["Low"]), 4),
                "close": round(float(row["Close"]), 4),
                "volume": int(row["Volume"]),
            })
        else:
            results.append({
                "date": str(idx.date()),
                "open": round(float(row["Open"]), 4),
                "high": round(float(row["High"]), 4),
                "low": round(float(row["Low"]), 4),
                "close": round(float(row["Close"]), 4),
                "volume": int(row["Volume"]),
            })

    set_cache(db, cache_key, results, TTL["history"])
    return results


async def get_returns_dataframe(tickers: list[str], period: str = "2y") -> pd.DataFrame:
    """Download price history for multiple tickers and return a DataFrame of daily returns."""
    prices_dict: dict[str, pd.Series] = {}

    for ticker in tickers:
        try:
            hist = yf.Ticker(ticker).history(period=period)
            if not hist.empty and "Close" in hist.columns:
                close = hist["Close"]
                if isinstance(close, pd.DataFrame):
                    close = close.iloc[:, 0]
                close.index = pd.to_datetime(close.index).tz_localize(None)
                prices_dict[ticker] = close.astype(float)
        except Exception:
            continue

    if len(prices_dict) < 2:
        raise ValueError(
            f"Could not get price data for enough tickers. "
            f"Got data for: {list(prices_dict.keys())}. "
            "Check that the tickers are valid US stock symbols."
        )

    prices = pd.DataFrame(prices_dict)
    prices = prices.dropna(how="all")

    min_obs = len(prices) * 0.8
    prices = prices.dropna(thresh=int(min_obs), axis=1)
    prices = prices.ffill().dropna()

    returns = prices.pct_change().dropna()
    return returns


async def get_batch_prices(tickers: list[str]) -> dict[str, float]:
    """Fetch last close price for a list of tickers in one yfinance download call."""
    if not tickers:
        return {}
    try:
        joined = " ".join(tickers)
        hist = yf.download(joined, period="2d", progress=False, auto_adjust=True)
        close = hist.get("Close")
        if close is None:
            return {}
        if isinstance(close, pd.Series):
            val = float(close.dropna().iloc[-1]) if not close.dropna().empty else None
            return {tickers[0]: val} if val is not None else {}
        result = {}
        for t in tickers:
            col = close.get(t)
            if col is not None:
                last = col.dropna()
                if not last.empty:
                    result[t] = float(last.iloc[-1])
        return result
    except Exception:
        return {}


async def get_quote(db: Session, ticker: str) -> dict:
    cache_key = f"yf_quote:{ticker}"
    cached = get_cached(db, cache_key)
    if cached:
        return cached

    stock = yf.Ticker(ticker)
    fi = stock.fast_info   # lightweight, faster than .info
    info = stock.info      # needed for pre/post market and volume

    # fast_info has the freshest last_price
    price = fi.last_price or info.get("currentPrice") or info.get("regularMarketPrice")
    prev_close = fi.regular_market_previous_close or info.get("regularMarketPreviousClose")
    change = round(price - prev_close, 4) if price and prev_close else None
    change_pct = round((change / prev_close) * 100, 4) if change and prev_close else None

    result = {
        "ticker": ticker,
        "price": round(price, 2) if price else None,
        "change": change,
        "change_pct": change_pct,
        "high": fi.day_high or info.get("regularMarketDayHigh"),
        "low": fi.day_low or info.get("regularMarketDayLow"),
        "open": fi.open or info.get("regularMarketOpen"),
        "prev_close": prev_close,
        "volume": fi.last_volume or info.get("regularMarketVolume"),
        # Pre / after-market
        "pre_market_price": info.get("preMarketPrice"),
        "pre_market_change": info.get("preMarketChange"),
        "pre_market_change_pct": info.get("preMarketChangePercent"),
        "post_market_price": info.get("postMarketPrice"),
        "post_market_change": info.get("postMarketChange"),
        "post_market_change_pct": info.get("postMarketChangePercent"),
        "has_pre_post_data": bool(info.get("hasPrePostMarketData")),
    }
    set_cache(db, cache_key, result, TTL["quote"])
    return result


async def get_profile(db: Session, ticker: str) -> dict:
    cache_key = f"yf_profile:{ticker}"
    cached = get_cached(db, cache_key)
    if cached:
        return cached

    stock = yf.Ticker(ticker)
    info = stock.info

    result = {
        "ticker": ticker,
        "name": info.get("longName") or info.get("shortName"),
        "exchange": info.get("exchange"),
        "sector": info.get("sector"),
        "industry": info.get("industry"),
        "country": info.get("country"),
        "currency": info.get("currency"),
        "logo": None,
        "website": info.get("website"),
        "market_cap": info.get("marketCap"),
        "shares_outstanding": info.get("sharesOutstanding"),
        "ipo_date": None,
        "description": info.get("longBusinessSummary"),
        "employees": info.get("fullTimeEmployees"),
        "52w_high": info.get("fiftyTwoWeekHigh"),
        "52w_low": info.get("fiftyTwoWeekLow"),
        "avg_volume": info.get("averageVolume"),
        "beta": info.get("beta"),
    }
    set_cache(db, cache_key, result, TTL["profile"])
    return result


async def get_metrics(db: Session, ticker: str) -> dict:
    cache_key = f"yf_metrics:{ticker}"
    cached = get_cached(db, cache_key)
    if cached:
        return cached

    stock = yf.Ticker(ticker)
    info = stock.info

    result = {
        "pe_ratio": info.get("trailingPE"),
        "forward_pe": info.get("forwardPE"),
        "pb_ratio": info.get("priceToBook"),
        "ps_ratio": info.get("priceToSalesTrailing12Months"),
        "ev_ebitda": info.get("enterpriseToEbitda"),
        "roe": info.get("returnOnEquity"),
        "roa": info.get("returnOnAssets"),
        "debt_to_equity": info.get("debtToEquity"),
        "current_ratio": info.get("currentRatio"),
        "dividend_yield": info.get("dividendYield"),
        "earnings_yield": (1 / info["trailingPE"]) if info.get("trailingPE") else None,
        "free_cash_flow_yield": None,
        "revenue_per_share": info.get("revenuePerShare"),
        "net_income_per_share": info.get("trailingEps"),
    }
    set_cache(db, cache_key, result, TTL["metrics"])
    return result


async def get_analyst(db: Session, ticker: str) -> dict:
    cache_key = f"yf_analyst:{ticker}"
    cached = get_cached(db, cache_key)
    if cached:
        return cached

    stock = yf.Ticker(ticker)
    info = stock.info

    trends = {}
    try:
        recs = stock.recommendations
        if recs is not None and not recs.empty:
            latest = recs.iloc[-1]
            trends = {
                "period": str(latest.name.date()) if hasattr(latest.name, "date") else str(latest.name),
                "strong_buy": int(latest.get("strongBuy", 0)),
                "buy": int(latest.get("buy", 0)),
                "hold": int(latest.get("hold", 0)),
                "sell": int(latest.get("sell", 0)),
                "strong_sell": int(latest.get("strongSell", 0)),
            }
    except Exception:
        pass

    targets = {
        "target_high": info.get("targetHighPrice"),
        "target_low": info.get("targetLowPrice"),
        "target_consensus": info.get("targetMeanPrice"),
        "target_median": info.get("targetMedianPrice"),
    }

    result = {
        "recommendation_trends": trends,
        "price_targets": targets,
        "estimates": [],
    }
    set_cache(db, cache_key, result, TTL["analyst"])
    return result


def _df_row(df: pd.DataFrame, key: str) -> float | None:
    if key in df.index:
        val = df.loc[key]
        if hasattr(val, "iloc"):
            val = val.iloc[0]
        return None if pd.isna(val) else float(val)
    return None


async def get_income_statement(db: Session, ticker: str, period: str = "annual", limit: int = 5) -> list[dict]:
    cache_key = f"yf_income:{ticker}:{period}"
    cached = get_cached(db, cache_key)
    if cached:
        return cached

    def _fetch():
        stock = yf.Ticker(ticker)
        return stock.quarterly_income_stmt if period == "quarter" else stock.income_stmt

    df = await asyncio.to_thread(_fetch)

    if df is None or df.empty:
        return []

    results = []
    for col in list(df.columns)[:limit]:
        date_str = str(col.date()) if hasattr(col, "date") else str(col)[:10]

        def g(key: str) -> float | None:
            if key in df.index:
                val = df.loc[key, col]
                return None if pd.isna(val) else float(val)
            return None

        rev = g("Total Revenue")
        gp = g("Gross Profit")
        gross_margin = (gp / rev) if (rev and gp) else None
        oi = g("Operating Income")
        op_margin = (oi / rev) if (rev and oi) else None
        ni = g("Net Income")
        net_margin = (ni / rev) if (rev and ni) else None

        results.append({
            "date": date_str,
            "period": "Q" if period == "quarter" else "FY",
            "revenue": rev,
            "gross_profit": gp,
            "gross_margin": gross_margin,
            "operating_income": oi,
            "operating_margin": op_margin,
            "net_income": ni,
            "net_margin": net_margin,
            "ebitda": g("EBITDA"),
            "eps": g("Basic EPS"),
            "eps_diluted": g("Diluted EPS"),
            "shares_outstanding": g("Basic Average Shares") or g("Diluted Average Shares"),
            "rd_expenses": g("Research And Development"),
            "sga_expenses": g("Selling General And Administration"),
        })

    set_cache(db, cache_key, results, TTL["financials"])
    return results


async def get_balance_sheet(db: Session, ticker: str, period: str = "annual", limit: int = 5) -> list[dict]:
    cache_key = f"yf_balance:{ticker}:{period}"
    cached = get_cached(db, cache_key)
    if cached:
        return cached

    def _fetch():
        stock = yf.Ticker(ticker)
        return stock.quarterly_balance_sheet if period == "quarter" else stock.balance_sheet

    df = await asyncio.to_thread(_fetch)

    if df is None or df.empty:
        return []

    results = []
    for col in list(df.columns)[:limit]:
        date_str = str(col.date()) if hasattr(col, "date") else str(col)[:10]

        def g(key: str) -> float | None:
            if key in df.index:
                val = df.loc[key, col]
                return None if pd.isna(val) else float(val)
            return None

        results.append({
            "date": date_str,
            "period": "Q" if period == "quarter" else "FY",
            "cash": g("Cash And Cash Equivalents") or g("Cash Cash Equivalents And Short Term Investments"),
            "total_current_assets": g("Current Assets"),
            "total_assets": g("Total Assets"),
            "total_current_liabilities": g("Current Liabilities"),
            "total_liabilities": g("Total Liabilities Net Minority Interest"),
            "total_equity": g("Stockholders Equity") or g("Total Equity Gross Minority Interest"),
            "total_debt": g("Total Debt"),
            "net_debt": g("Net Debt"),
            "goodwill": g("Goodwill"),
            "retained_earnings": g("Retained Earnings"),
        })

    set_cache(db, cache_key, results, TTL["financials"])
    return results


async def get_cash_flow(db: Session, ticker: str, period: str = "annual", limit: int = 5) -> list[dict]:
    cache_key = f"yf_cashflow:{ticker}:{period}"
    cached = get_cached(db, cache_key)
    if cached:
        return cached

    def _fetch():
        stock = yf.Ticker(ticker)
        return stock.quarterly_cashflow if period == "quarter" else stock.cashflow

    df = await asyncio.to_thread(_fetch)

    if df is None or df.empty:
        return []

    results = []
    for col in list(df.columns)[:limit]:
        date_str = str(col.date()) if hasattr(col, "date") else str(col)[:10]

        def g(key: str) -> float | None:
            if key in df.index:
                val = df.loc[key, col]
                return None if pd.isna(val) else float(val)
            return None

        results.append({
            "date": date_str,
            "period": "Q" if period == "quarter" else "FY",
            "operating_cash_flow": g("Operating Cash Flow") or g("Cash Flow From Continuing Operating Activities"),
            "investing_cash_flow": g("Investing Cash Flow") or g("Cash Flow From Continuing Investing Activities"),
            "financing_cash_flow": g("Financing Cash Flow") or g("Cash Flow From Continuing Financing Activities"),
            "free_cash_flow": g("Free Cash Flow"),
            "capex": g("Capital Expenditure"),
            "dividends_paid": g("Common Stock Dividend Paid") or g("Payment Of Dividends"),
            "stock_repurchases": g("Repurchase Of Capital Stock"),
            "depreciation": g("Depreciation And Amortization") or g("Depreciation Amortization Depletion"),
        })

    set_cache(db, cache_key, results, TTL["financials"])
    return results


async def get_news(db: Session, ticker: str, limit: int = 20) -> list[dict]:
    cache_key = f"yf_news:{ticker}"
    cached = get_cached(db, cache_key)
    if cached:
        return cached[:limit]

    stock = yf.Ticker(ticker)
    raw = stock.news or []

    results = []
    for item in raw:
        content = item.get("content", {})
        if not content:
            continue
        thumbnail = content.get("thumbnail") or {}
        resolutions = thumbnail.get("resolutions") or []
        image = resolutions[0].get("url") if resolutions else thumbnail.get("originalUrl")
        canonical = content.get("canonicalUrl") or content.get("clickThroughUrl") or {}
        pub = content.get("pubDate", "")

        results.append({
            "headline": content.get("title"),
            "summary": content.get("summary") or content.get("description", ""),
            "source": (content.get("provider") or {}).get("displayName"),
            "url": canonical.get("url"),
            "image": image,
            "published_at": pub,
            "sentiment": None,
        })

    set_cache(db, cache_key, results, TTL["news"])
    return results[:limit]


def _sync_income_statement(ticker: str, period: str, limit: int) -> list[dict]:
    stock = yf.Ticker(ticker)
    df = stock.quarterly_income_stmt if period == "quarter" else stock.income_stmt
    if df is None or df.empty:
        return []
    results = []
    for col in list(df.columns)[:limit]:
        date_str = str(col.date()) if hasattr(col, "date") else str(col)[:10]
        def g(key):
            if key in df.index:
                val = df.loc[key, col]
                return None if pd.isna(val) else float(val)
            return None
        rev = g("Total Revenue")
        gp = g("Gross Profit")
        oi = g("Operating Income")
        ni = g("Net Income")
        results.append({
            "date": date_str,
            "period": "Q" if period == "quarter" else "FY",
            "revenue": rev,
            "gross_profit": gp,
            "gross_margin": (gp / rev) if (rev and gp) else None,
            "operating_income": oi,
            "operating_margin": (oi / rev) if (rev and oi) else None,
            "net_income": ni,
            "net_margin": (ni / rev) if (rev and ni) else None,
            "ebitda": g("EBITDA"),
            "eps": g("Basic EPS"),
            "eps_diluted": g("Diluted EPS"),
            "shares_outstanding": g("Basic Average Shares") or g("Diluted Average Shares"),
            "rd_expenses": g("Research And Development"),
            "sga_expenses": g("Selling General And Administration"),
        })
    return results


def _sync_balance_sheet(ticker: str, period: str, limit: int) -> list[dict]:
    stock = yf.Ticker(ticker)
    df = stock.quarterly_balance_sheet if period == "quarter" else stock.balance_sheet
    if df is None or df.empty:
        return []
    results = []
    for col in list(df.columns)[:limit]:
        date_str = str(col.date()) if hasattr(col, "date") else str(col)[:10]
        def g(key):
            if key in df.index:
                val = df.loc[key, col]
                return None if pd.isna(val) else float(val)
            return None
        results.append({
            "date": date_str,
            "period": "Q" if period == "quarter" else "FY",
            "cash": g("Cash And Cash Equivalents") or g("Cash Cash Equivalents And Short Term Investments"),
            "total_current_assets": g("Current Assets"),
            "total_assets": g("Total Assets"),
            "total_current_liabilities": g("Current Liabilities"),
            "total_liabilities": g("Total Liabilities Net Minority Interest"),
            "total_equity": g("Stockholders Equity") or g("Total Equity Gross Minority Interest"),
            "total_debt": g("Total Debt"),
            "net_debt": g("Net Debt"),
            "goodwill": g("Goodwill"),
            "retained_earnings": g("Retained Earnings"),
        })
    return results


def _sync_cash_flow(ticker: str, period: str, limit: int) -> list[dict]:
    stock = yf.Ticker(ticker)
    df = stock.quarterly_cashflow if period == "quarter" else stock.cashflow
    if df is None or df.empty:
        return []
    results = []
    for col in list(df.columns)[:limit]:
        date_str = str(col.date()) if hasattr(col, "date") else str(col)[:10]
        def g(key):
            if key in df.index:
                val = df.loc[key, col]
                return None if pd.isna(val) else float(val)
            return None
        results.append({
            "date": date_str,
            "period": "Q" if period == "quarter" else "FY",
            "operating_cash_flow": g("Operating Cash Flow") or g("Cash Flow From Continuing Operating Activities"),
            "investing_cash_flow": g("Investing Cash Flow") or g("Cash Flow From Continuing Investing Activities"),
            "financing_cash_flow": g("Financing Cash Flow") or g("Cash Flow From Continuing Financing Activities"),
            "free_cash_flow": g("Free Cash Flow"),
            "capex": g("Capital Expenditure"),
            "dividends_paid": g("Common Stock Dividend Paid") or g("Payment Of Dividends"),
            "stock_repurchases": g("Repurchase Of Capital Stock"),
            "depreciation": g("Depreciation And Amortization") or g("Depreciation Amortization Depletion"),
        })
    return results


def _dcf_per_share(revenue, growth_rates, ebit_margin, tax_rate, capex_pct, da_pct,
                    wacc, tgr, shares, net_debt):
    """Simple DCF replicating dcf_calculator logic, returns intrinsic value per share."""
    fcf_margin = ebit_margin * (1 - tax_rate) + da_pct - capex_pct
    pv_sum = 0.0
    r = float(revenue)
    for i, g in enumerate(growth_rates):
        r *= (1 + g)
        pv_sum += (r * fcf_margin) / (1 + wacc) ** (i + 1)
    if wacc <= tgr:
        return None
    terminal_fcf = r * fcf_margin * (1 + tgr)
    pv_tv = (terminal_fcf / (wacc - tgr)) / (1 + wacc) ** len(growth_rates)
    equity = pv_sum + pv_tv - float(net_debt)
    return equity / float(shares)


def _wacc_for_target(target, revenue, growth_rates, ebit_margin, tax_rate, capex_pct,
                      da_pct, tgr, shares, net_debt):
    """Binary search: find WACC so that DCF intrinsic value ≈ target price."""
    # WACC must strictly exceed TGR (Gordon growth model requirement)
    lo = max(0.04, tgr + 0.001)
    hi = 0.18
    if lo >= hi:
        return lo
    val_lo = _dcf_per_share(revenue, growth_rates, ebit_margin, tax_rate, capex_pct,
                              da_pct, lo, tgr, shares, net_debt)
    val_hi = _dcf_per_share(revenue, growth_rates, ebit_margin, tax_rate, capex_pct,
                              da_pct, hi, tgr, shares, net_debt)
    if val_lo is None or val_hi is None:
        return 0.09
    # Higher WACC → lower value, so val_lo > val_hi
    if target >= val_lo:
        return lo    # analyst target above even min-WACC output — clip to min
    if target <= val_hi:
        return hi    # analyst target below even max-WACC output — clip to max
    for _ in range(50):
        mid = (lo + hi) / 2
        val = _dcf_per_share(revenue, growth_rates, ebit_margin, tax_rate, capex_pct,
                               da_pct, mid, tgr, shares, net_debt)
        if val is None:
            break
        if val > target:
            lo = mid   # value too high → raise WACC
        else:
            hi = mid   # value too low  → lower WACC
    return (lo + hi) / 2


def get_dcf_prefill_sync(db: Session, ticker: str) -> dict:
    cache_key = f"dcf_prefill_v9:{ticker}"
    cached = get_cached(db, cache_key)
    if cached:
        return cached

    stock = yf.Ticker(ticker)

    # info has reliable TTM figures for margins, shares, cash, FCF
    info = stock.info

    # Income statement: only used for revenue history (growth rates)
    income_data = _sync_income_statement(ticker, "annual", 5)
    cashflow_data = _sync_cash_flow(ticker, "annual", 3)

    # Historical revenue growth (backward-looking baseline)
    revenues = [d["revenue"] for d in income_data if d.get("revenue")]
    hist_growth_rates = []
    for i in range(1, len(revenues)):
        if revenues[i] and revenues[i - 1]:
            hist_growth_rates.append((revenues[i - 1] - revenues[i]) / revenues[i])
    hist_avg_growth = sum(hist_growth_rates) / len(hist_growth_rates) if hist_growth_rates else 0.08

    # Use most recent TTM revenue growth as seed when it's higher than historical avg
    # (analysts use forward/recent momentum, not 5-year backward average)
    recent_growth = info.get("revenueGrowth")
    if recent_growth and isinstance(recent_growth, (int, float)) and recent_growth > 0:
        growth_seed = min(max(hist_avg_growth, float(recent_growth)), 0.40)
    else:
        growth_seed = hist_avg_growth

    # 5-year declining growth schedule from seed
    growth_rates_suggestion = [
        growth_seed,
        growth_seed * 0.9,
        growth_seed * 0.8,
        growth_seed * 0.7,
        max(growth_seed * 0.6, 0.02),
    ]

    # TTM operating margin from info — far more reliable than multi-year stmt average
    op_margin = info.get("operatingMargins")
    if not op_margin:
        op_margins = [d["operating_margin"] for d in income_data if d.get("operating_margin")]
        op_margin = sum(op_margins) / len(op_margins) if op_margins else 0.15
    op_margin = max(0.01, float(op_margin))

    # Shares outstanding from info (most reliable source)
    shares = (
        info.get("sharesOutstanding")
        or info.get("impliedSharesOutstanding")
        or (income_data[0].get("shares_outstanding") if income_data else None)
    )

    # Net debt: total debt minus total cash (negative = net cash position)
    total_debt = float(info.get("totalDebt") or 0)
    total_cash = float(info.get("totalCash") or 0)
    net_debt = total_debt - total_cash

    # Current revenue: prefer TTM from info
    ttm_revenue = float(info.get("totalRevenue") or 0) or (income_data[0].get("revenue") if income_data else None)

    # D&A and CapEx — multi-year averages from cashflow
    da_pcts = []
    raw_capex_pcts = []
    for inc, cf in zip(income_data, cashflow_data):
        rev = inc.get("revenue")
        da = cf.get("depreciation")
        capex = cf.get("capex")
        if rev and da:
            da_pcts.append(abs(float(da)) / float(rev))
        if rev and capex:
            raw_capex_pcts.append(abs(float(capex)) / float(rev))

    if da_pcts:
        avg_da_pct = sum(da_pcts) / len(da_pcts)
    else:
        ebitda_margin = info.get("ebitdaMargins")
        avg_da_pct = max(0.01, float(ebitda_margin) - op_margin) if ebitda_margin else 0.03

    # Effective tax rate
    effective_tax = info.get("effectiveTaxRate")
    if not effective_tax or effective_tax <= 0 or effective_tax >= 0.5:
        effective_tax = 0.21
    effective_tax = float(effective_tax)

    nopat_margin = op_margin * (1 - effective_tax)

    if raw_capex_pcts:
        avg_raw_capex = sum(raw_capex_pcts) / len(raw_capex_pcts)
        implied_capex_pct = max(0.01, min(avg_raw_capex, nopat_margin + avg_da_pct - 0.03))
    else:
        implied_capex_pct = max(0.01, min(avg_da_pct * 1.2, nopat_margin - 0.03))

    # Terminal growth rate based on company size
    market_cap = info.get("marketCap") or 0
    if market_cap >= 500e9:
        tgr_suggestion = 0.03
    elif market_cap >= 100e9:
        tgr_suggestion = 0.028
    elif market_cap >= 10e9:
        tgr_suggestion = 0.025
    else:
        tgr_suggestion = 0.02

    # WACC: calibrate to analyst consensus price target so DCF ≈ analyst target.
    # If no analyst target, fall back to size-based default.
    analyst_target = info.get("targetMeanPrice")
    wacc_suggestion = None
    if (analyst_target and isinstance(analyst_target, (int, float)) and analyst_target > 0
            and ttm_revenue and shares):
        try:
            wacc_suggestion = _wacc_for_target(
                target=float(analyst_target),
                revenue=float(ttm_revenue),
                growth_rates=growth_rates_suggestion,
                ebit_margin=op_margin,
                tax_rate=effective_tax,
                capex_pct=implied_capex_pct,
                da_pct=avg_da_pct,
                tgr=tgr_suggestion,
                shares=float(shares),
                net_debt=float(net_debt),
            )
            wacc_suggestion = round(max(0.05, min(wacc_suggestion, 0.15)), 4)
        except Exception:
            pass

    if wacc_suggestion is None:
        if market_cap >= 500e9:
            wacc_suggestion = 0.085
        elif market_cap >= 100e9:
            wacc_suggestion = 0.09
        elif market_cap >= 10e9:
            wacc_suggestion = 0.10
        else:
            wacc_suggestion = 0.11

    result = {
        "ticker": ticker,
        "revenue_growth_suggestion": round(growth_seed, 4),
        "ebit_margin_suggestion": round(op_margin, 4),
        "da_pct_suggestion": round(avg_da_pct, 4),
        "capex_pct_suggestion": round(implied_capex_pct, 4),
        "tax_rate_suggestion": round(effective_tax, 4),
        "wacc_suggestion": round(wacc_suggestion, 4),
        "tgr_suggestion": tgr_suggestion,
        "analyst_target": float(analyst_target) if analyst_target else None,
        "current_revenue": ttm_revenue,
        "shares_outstanding": shares,
        "net_debt": net_debt,
        "historical_revenues": [
            {"date": d["date"], "revenue": d["revenue"]} for d in income_data
        ],
        "historical_growth_rates": hist_growth_rates,
    }
    set_cache(db, cache_key, result, TTL["dcf_prefill"])
    return result


async def get_dcf_prefill(db: Session, ticker: str) -> dict:
    return get_dcf_prefill_sync(db, ticker)


# ── Peer map: ticker → list of comparable companies ──────────────────────────
# Peers are curated to share the same business sub-model (not just broad sector).
# Market cap proximity sort in get_comparables_data further refines the final selection.
_PEER_MAP: dict[str, list[str]] = {
    # Mega-cap consumer tech (hardware + ecosystem)
    "AAPL":  ["MSFT", "GOOGL", "META", "SONY", "QCOM", "AMZN"],
    # Enterprise software + cloud platform
    "MSFT":  ["GOOGL", "AMZN", "ORCL", "CRM", "SAP", "IBM"],
    # Digital advertising + cloud (search-led)
    "GOOGL": ["META", "MSFT", "AMZN", "TTD", "IAC", "SNAP"],
    "GOOG":  ["META", "MSFT", "AMZN", "TTD", "IAC", "SNAP"],
    # Social media + digital advertising
    "META":  ["GOOGL", "SNAP", "PINS", "RDDT", "TTD", "MGNI"],
    # E-commerce + cloud + ads (conglomerate — use similar large-cap platform peers)
    "AMZN":  ["MSFT", "GOOGL", "WMT", "COST", "BABA", "JD"],
    # Fabless GPU / AI chip designer
    "NVDA":  ["AMD", "INTC", "AVGO", "QCOM", "MRVL", "ARM"],
    # EV / clean energy auto
    "TSLA":  ["RIVN", "NIO", "LCID", "GM", "F", "STLA"],
    # Subscription video streaming
    "NFLX":  ["DIS", "PARA", "WBD", "AMZN", "AAPL", "SPOT"],
    # Software / SaaS — CRM & enterprise workflow
    "CRM":   ["NOW", "WDAY", "ADBE", "ORCL", "SAP"],
    "ADBE":  ["CRM", "NOW", "WDAY", "ORCL", "MSFT"],
    "NOW":   ["CRM", "WDAY", "ADBE", "ORCL", "SAP"],
    "WDAY":  ["CRM", "NOW", "SAP", "ORCL", "ADBE"],
    "ORCL":  ["CRM", "SAP", "NOW", "MSFT", "IBM"],
    "SAP":   ["ORCL", "CRM", "NOW", "WDAY", "MSFT"],
    "IBM":   ["ORCL", "MSFT", "ACN", "CSCO", "HPQ"],
    # Networking hardware
    "CSCO":  ["ANET", "JNPR", "HPE", "NTAP", "CIEN"],
    "ANET":  ["CSCO", "JNPR", "HPE", "NTAP", "CIEN"],
    # Cybersecurity (enterprise)
    "PANW":  ["CRWD", "FTNT", "ZS", "OKTA", "CYBR"],
    "CRWD":  ["PANW", "FTNT", "ZS", "OKTA", "S"],
    "FTNT":  ["PANW", "CRWD", "ZS", "OKTA", "CYBR"],
    "ZS":    ["PANW", "CRWD", "OKTA", "NET", "CYBR"],
    "OKTA":  ["CRWD", "PANW", "ZS", "CYBR", "S"],
    # Cloud data / analytics
    "SNOW":  ["DDOG", "MDB", "PLTR", "NET", "ESTC"],
    "MDB":   ["SNOW", "DDOG", "ESTC", "NET", "PLTR"],
    "DDOG":  ["SNOW", "MDB", "ESTC", "NET", "SPLK"],
    "NET":   ["FSLY", "AKAM", "ZS", "PANW", "DDOG"],
    "PLTR":  ["SNOW", "MDB", "AI", "DDOG", "ESTC"],
    # E-commerce platforms
    "SHOP":  ["BIGC", "WIX", "ETSY", "EBAY", "AMZN"],
    "ETSY":  ["EBAY", "SHOP", "AMZN", "PINS", "BIGC"],
    "EBAY":  ["AMZN", "ETSY", "SHOP", "BABA", "WISH"],
    # Ride-hailing / gig platforms
    "UBER":  ["LYFT", "GRAB", "DASH", "DIDI", "BOLT"],
    "LYFT":  ["UBER", "GRAB", "DASH", "DIDI", "BIRD"],
    "DASH":  ["UBER", "LYFT", "CART", "DIDI", "GRAB"],
    # Travel / OTA
    "BKNG":  ["EXPE", "ABNB", "TRIP", "SABR", "MMYT"],
    "EXPE":  ["BKNG", "ABNB", "TRIP", "SABR", "MMYT"],
    "ABNB":  ["BKNG", "EXPE", "TRIP", "VACASA", "VTRV"],
    # Fabless semiconductors — GPU/CPU
    "AMD":   ["NVDA", "INTC", "AVGO", "QCOM", "MRVL"],
    "INTC":  ["AMD", "NVDA", "QCOM", "AVGO", "MRVL"],
    # Fabless semi — wireless / broadband
    "QCOM":  ["AVGO", "MRVL", "SWKS", "QRVO", "AMD"],
    "AVGO":  ["QCOM", "MRVL", "TXN", "ADI", "AMD"],
    "MRVL":  ["AVGO", "QCOM", "SWKS", "AMD", "INTC"],
    "ARM":   ["QCOM", "AMD", "NVDA", "AVGO", "INTC"],
    # Analog / mixed-signal semi
    "TXN":   ["ADI", "MCHP", "ON", "NXPI", "AVGO"],
    "ADI":   ["TXN", "MCHP", "ON", "NXPI", "SWKS"],
    "MCHP":  ["TXN", "ADI", "ON", "NXPI", "SWKS"],
    # Memory chips
    "MU":    ["WDC", "STX", "AMAT", "LRCX", "KIOXIA"],
    # Semi capital equipment
    "AMAT":  ["LRCX", "KLAC", "ASML", "TER", "ENTG"],
    "ASML":  ["AMAT", "LRCX", "KLAC", "TER", "ENTG"],
    "LRCX":  ["AMAT", "KLAC", "ASML", "TER", "ENTG"],
    # Payments network (duopoly + adjacent)
    "V":     ["MA", "AXP", "PYPL", "FIS", "FISV"],
    "MA":    ["V", "AXP", "PYPL", "FIS", "FISV"],
    # Digital payments / wallets
    "PYPL":  ["SQ", "AFRM", "SOFI", "V", "MA"],
    "SQ":    ["PYPL", "AFRM", "SOFI", "UPST", "LC"],
    # Charge card / premium consumer credit
    "AXP":   ["V", "MA", "DFS", "COF", "PYPL"],
    "DFS":   ["AXP", "COF", "SYF", "MA", "V"],
    "COF":   ["AXP", "DFS", "SYF", "JPM", "BAC"],
    "AFRM":  ["UPST", "SQ", "SOFI", "LC", "PYPL"],
    # Streaming audio
    "SPOT":  ["AMZN", "AAPL", "GOOGL", "NFLX", "ROKU"],
    "ROKU":  ["SPOT", "DIS", "NFLX", "TTD", "AMZN"],
    # Digital ad tech
    "TTD":   ["GOOGL", "META", "PUBM", "MGNI", "APP"],
    "MGNI":  ["TTD", "PUBM", "APP", "GOOGL", "META"],
    # Social / photo sharing
    "SNAP":  ["META", "PINS", "RDDT", "GOOGL", "TWTR"],
    "PINS":  ["META", "SNAP", "RDDT", "GOOGL", "TTD"],
    "RDDT":  ["META", "SNAP", "PINS", "TWTR", "GOOGL"],
    # Large-cap banks (universal)
    "JPM":   ["BAC", "GS", "MS", "C", "WFC"],
    "BAC":   ["JPM", "GS", "C", "WFC", "MS"],
    "GS":    ["MS", "JPM", "BAC", "C", "BLK"],
    "MS":    ["GS", "JPM", "BAC", "C", "BLK"],
    "C":     ["JPM", "BAC", "GS", "MS", "WFC"],
    "WFC":   ["JPM", "BAC", "C", "USB", "TFC"],
    # Asset management
    "BLK":   ["MS", "GS", "SCHW", "STT", "IVZ"],
    "SCHW":  ["IBKR", "BLK", "MS", "STT", "IVZ"],
    # Diversified holding / insurance
    "BRK-B": ["JPM", "BAC", "AIG", "MET", "PRU"],
    # Pharma — large-cap diversified
    "JNJ":   ["PFE", "ABBV", "MRK", "BMY", "LLY"],
    "PFE":   ["JNJ", "ABBV", "MRK", "BMY", "AZN"],
    # Pharma — GLP-1 / obesity focus
    "LLY":   ["NVO", "AZN", "ABBV", "MRK", "REGN"],
    "NVO":   ["LLY", "AZN", "ABBV", "MRK", "PFE"],
    # Pharma — immunology / oncology
    "ABBV":  ["JNJ", "MRK", "BMY", "REGN", "AMGN"],
    "MRK":   ["PFE", "JNJ", "ABBV", "BMY", "LLY"],
    "BMY":   ["MRK", "JNJ", "ABBV", "AZN", "PFE"],
    # Large biotech
    "AMGN":  ["GILD", "REGN", "VRTX", "BIIB", "BMY"],
    "GILD":  ["AMGN", "REGN", "VRTX", "BIIB", "ABBV"],
    "REGN":  ["AMGN", "GILD", "VRTX", "BIIB", "LLY"],
    "VRTX":  ["AMGN", "REGN", "GILD", "BIIB", "ALNY"],
    # Medical devices — large-cap diversified
    "MDT":   ["ABT", "SYK", "BSX", "EW", "ZBH"],
    "ABT":   ["MDT", "SYK", "BSX", "DHR", "TMO"],
    "SYK":   ["MDT", "BSX", "ZBH", "ABT", "EW"],
    # Life science instruments
    "DHR":   ["ABT", "TMO", "A", "BIO", "IDXX"],
    "TMO":   ["DHR", "ABT", "A", "BIO", "ILMN"],
    # Telecom carriers (US)
    "T":     ["VZ", "TMUS", "CMCSA", "CHTR"],
    "VZ":    ["T", "TMUS", "CMCSA", "SBAC"],
    "TMUS":  ["T", "VZ", "CMCSA", "CHTR"],
    # Cable / media conglomerate
    "CMCSA": ["CHTR", "DIS", "T", "VZ", "PARA"],
    "DIS":   ["CMCSA", "NFLX", "PARA", "WBD", "FOXA"],
    "PARA":  ["DIS", "WBD", "CMCSA", "FOXA", "NFLX"],
    "WBD":   ["DIS", "PARA", "CMCSA", "FOXA", "NFLX"],
    # Warehouse / big-box retail
    "WMT":   ["COST", "TGT", "AMZN", "DG", "DLTR"],
    "COST":  ["WMT", "TGT", "BJ", "AMZN", "DG"],
    "TGT":   ["WMT", "COST", "KSS", "AMZN", "DLTR"],
    # Home improvement retail
    "HD":    ["LOW", "TSCO", "FAST", "SHW", "FND"],
    "LOW":   ["HD", "TSCO", "FAST", "SHW", "FND"],
    # Food & beverages
    "KO":    ["PEP", "MNST", "STZ", "TAP", "FIZZ"],
    "PEP":   ["KO", "MNST", "MDLZ", "GIS", "K"],
    "MDLZ":  ["PEP", "KO", "GIS", "K", "SJM"],
    # Restaurants — quick service
    "MCD":   ["QSR", "YUM", "CMG", "DPZ", "SBUX"],
    "SBUX":  ["MCD", "QSR", "CMG", "DPZ", "DNKN"],
    "CMG":   ["MCD", "SBUX", "QSR", "TXRH", "DPZ"],
    "YUM":   ["MCD", "QSR", "CMG", "SBUX", "DPZ"],
    # Oil supermajors
    "XOM":   ["CVX", "COP", "OXY", "BP", "SHEL"],
    "CVX":   ["XOM", "COP", "OXY", "SLB", "BP"],
    "COP":   ["XOM", "CVX", "OXY", "DVN", "PXD"],
    # Oil-field services
    "SLB":   ["HAL", "BKR", "NOV", "RIG"],
    "HAL":   ["SLB", "BKR", "NOV", "RIG"],
    # Aerospace & defense
    "BA":    ["RTX", "LMT", "GD", "NOC", "TDG"],
    "RTX":   ["LMT", "GD", "NOC", "BA", "HII"],
    "LMT":   ["RTX", "GD", "NOC", "BA", "HII"],
    "GD":    ["LMT", "RTX", "NOC", "BA", "HII"],
    "NOC":   ["LMT", "RTX", "GD", "BA", "HII"],
    # Industrial conglomerates
    "GE":    ["HON", "MMM", "RTX", "EMR", "ROK"],
    "HON":   ["GE", "MMM", "EMR", "ROK", "ITW"],
    "MMM":   ["HON", "GE", "EMR", "ITW", "PH"],
    # Heavy machinery
    "CAT":   ["DE", "CNH", "AGCO", "PCAR", "CMI"],
    "DE":    ["CAT", "CNH", "AGCO", "PCAR", "CNHI"],
    # Traditional auto (ICE-dominant)
    "GM":    ["F", "STLA", "TM", "HMC", "TSLA"],
    "F":     ["GM", "STLA", "TM", "HMC", "TSLA"],
    # EV pure-play
    "RIVN":  ["TSLA", "LCID", "NIO", "XPEV", "LI"],
    "NIO":   ["XPEV", "LI", "BYD", "TSLA", "RIVN"],
    # Materials / mining
    "FCX":   ["TECK", "VALE", "RIO", "BHP", "SCCO"],
    "NEM":   ["AEM", "KGC", "WPM", "FNV", "AGI"],
    # REITs
    "PLD":   ["DRE", "EGP", "REXR", "FR", "EXR"],
    "AMT":   ["CCI", "SBAC", "SBA", "UNIT", "LUMN"],
    "SPG":   ["O", "MAC", "SKT", "PEI", "BRX"],
}


def _fetch_company_info_sync(sym: str) -> dict:
    """Fetch yfinance info for one symbol, return normalized dict."""
    try:
        info = yf.Ticker(sym).info
        price = (info.get("currentPrice") or info.get("regularMarketPrice")
                 or info.get("previousClose"))
        eps = info.get("trailingEps")
        rev_per_share = info.get("revenuePerShare")
        book_per_share = info.get("bookValue")
        pe = info.get("trailingPE")
        pb = info.get("priceToBook")
        ps = info.get("priceToSalesTrailing12Months")
        ev_ebitda = info.get("enterpriseToEbitda")
        ev_sales = info.get("enterpriseToRevenue")
        # Filter absurd outliers
        def _ok(v, mx):
            return float(v) if (v and isinstance(v, (int, float)) and 0 < v < mx) else None
        return {
            "symbol":    sym,
            "name":      info.get("longName") or info.get("shortName", sym),
            "sector":    info.get("sector", ""),
            "industry":  info.get("industry", ""),
            "price":     round(float(price), 2) if price else None,
            "market_cap": info.get("marketCap"),
            "pe_ratio":  _ok(pe, 500),
            "pb_ratio":  _ok(pb, 100),
            "ps_ratio":  _ok(ps, 200),
            "ev_ebitda": _ok(ev_ebitda, 500),
            "ev_sales":  _ok(ev_sales, 200),
            "roe":       info.get("returnOnEquity"),
            "dividend_yield": info.get("dividendYield"),
            "eps":       eps,
            "revenue_per_share":    rev_per_share,
            "book_value_per_share": book_per_share,
        }
    except Exception:
        return {"symbol": sym}


async def get_comparables_data(db: Session, ticker: str) -> dict:
    """Peer relative-valuation multiples and implied prices using yfinance."""
    cache_key = f"yf_comparables_v2:{ticker}"
    cached = get_cached(db, cache_key)
    if cached:
        return cached

    peer_symbols = _PEER_MAP.get(ticker, [])[:6]

    # Fetch target + all peers concurrently via thread pool
    all_symbols = [ticker] + peer_symbols
    companies = list(await asyncio.gather(
        *[asyncio.to_thread(_fetch_company_info_sync, s) for s in all_symbols]
    ))

    target = companies[0]
    raw_peers = [c for c in companies[1:] if c.get("price")]  # drop peers with no data

    # Sort by market-cap proximity to target (log-scale distance), keep 5 closest
    import math
    target_cap = target.get("market_cap") or 0
    if target_cap > 0:
        raw_peers.sort(key=lambda c: abs(math.log((c.get("market_cap") or target_cap) / target_cap)))
    peers = raw_peers[:5]

    def _median(vals: list, max_val: float) -> float | None:
        clean = sorted(v for v in vals
                       if v and isinstance(v, (int, float)) and 0 < v < max_val)
        if not clean:
            return None
        n = len(clean)
        mid = clean[n // 2] if n % 2 else (clean[n // 2 - 1] + clean[n // 2]) / 2
        return round(mid, 2)

    peer_medians = {
        "pe":       _median([c.get("pe_ratio")  for c in peers], 500),
        "pb":       _median([c.get("pb_ratio")  for c in peers], 100),
        "ps":       _median([c.get("ps_ratio")  for c in peers], 200),
        "ev_ebitda":_median([c.get("ev_ebitda") for c in peers], 500),
        "ev_sales": _median([c.get("ev_sales")  for c in peers], 200),
    }

    cur = target.get("price") or 0

    def _implied(multiple, metric_val, multiple_name: str, metric_label: str):
        if not multiple or not metric_val or metric_val <= 0:
            return None
        implied = round(float(multiple) * float(metric_val), 2)
        upside  = round((implied / cur - 1) * 100, 1) if cur > 0 else None
        return {
            "multiple_name": multiple_name,
            "multiple":      round(float(multiple), 2),
            "metric_label":  metric_label,
            "metric_value":  round(float(metric_val), 4),
            "implied_price": implied,
            "upside_pct":    upside,
        }

    implied_prices = {}
    if e := _implied(peer_medians["pe"], target.get("eps"),               "P/E", "EPS (TTM)"):
        implied_prices["pe"] = e
    if e := _implied(peer_medians["ps"], target.get("revenue_per_share"), "P/S", "Revenue / Share"):
        implied_prices["ps"] = e
    if e := _implied(peer_medians["pb"], target.get("book_value_per_share"), "P/B", "Book Value / Share"):
        implied_prices["pb"] = e

    vals = [v["implied_price"] for v in implied_prices.values() if v]
    composite = round(sum(vals) / len(vals), 2) if vals else None

    result = {
        "target":            target,
        "peers":             peers,
        "peer_medians":      peer_medians,
        "implied_prices":    implied_prices,
        "composite_implied": composite,
        "current_price":     cur or None,
    }
    set_cache(db, cache_key, result, TTL["comparables"])
    return result


async def get_stock_info(ticker: str) -> dict:
    stock = yf.Ticker(ticker)
    info = stock.info
    return {
        "ticker": ticker,
        "name": info.get("longName"),
        "sector": info.get("sector"),
        "industry": info.get("industry"),
        "description": info.get("longBusinessSummary"),
        "employees": info.get("fullTimeEmployees"),
        "website": info.get("website"),
        "52w_high": info.get("fiftyTwoWeekHigh"),
        "52w_low": info.get("fiftyTwoWeekLow"),
        "avg_volume": info.get("averageVolume"),
        "beta": info.get("beta"),
    }
