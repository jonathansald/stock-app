import numpy as np
import pandas as pd
from pypfopt import EfficientFrontier, expected_returns, risk_models
from pypfopt.risk_models import CovarianceShrinkage
from services.yfinance_service import get_returns_dataframe
import yfinance as yf


async def optimize_portfolio(
    tickers: list[str],
    risk_profile: str,
    period: str = "2y",
    min_w: float | None = None,
    max_w: float | None = None,
) -> dict:
    returns = await get_returns_dataframe(tickers, period)
    valid_tickers = returns.columns.tolist()

    if len(valid_tickers) < 2:
        raise ValueError("Need at least 2 valid tickers with sufficient price history.")

    mu = expected_returns.mean_historical_return(returns, returns_data=True)

    # Ledoit-Wolf shrinkage is more robust than raw sample covariance —
    # avoids singular matrices with correlated or few-observation assets
    try:
        S = CovarianceShrinkage(returns, returns_data=True).ledoit_wolf()
    except Exception:
        S = risk_models.sample_cov(returns, returns_data=True)

    n = len(valid_tickers)
    # Use caller-supplied bounds; fall back to dynamic defaults
    if min_w is None:
        min_w = 0.0
    if max_w is None:
        max_w = min(0.60, max(0.30, 1.0 / max(n - 1, 1)))

    weights = _run_with_fallback(mu, S, risk_profile, min_w, max_w)
    if weights is None:
        weights = {t: round(1 / n, 4) for t in valid_tickers}

    # Re-compute performance with a fresh EF using the same bounds
    ef_perf = EfficientFrontier(mu, S, weight_bounds=(min_w, max_w))
    try:
        ef_perf.set_weights(weights)
        perf = ef_perf.portfolio_performance(risk_free_rate=0.05, verbose=False)
    except Exception:
        perf = (0.0, 0.0, 0.0)

    # Frontier computed with the SAME constraints so the optimal point lies on it
    frontier_points = await compute_efficient_frontier(mu, S, min_w=min_w, max_w=max_w)
    portfolio_history = await backtest_portfolio(weights, returns)

    return {
        "weights": {k: round(v, 4) for k, v in weights.items() if v > 0.001},
        "expected_return": round(perf[0], 4),
        "volatility": round(perf[1], 4),
        "sharpe_ratio": round(perf[2], 4),
        "frontier_points": frontier_points,
        "portfolio_history": portfolio_history,
        "tickers_used": valid_tickers,
    }


def _run_with_fallback(
    mu: pd.Series,
    S: pd.DataFrame,
    risk_profile: str,
    min_w: float,
    max_w: float,
) -> dict | None:
    attempts = [
        # Primary attempt with dynamic bounds
        lambda: _try_optimize(mu, S, risk_profile, min_w, max_w),
        # Relax min weight to 0
        lambda: _try_optimize(mu, S, risk_profile, 0.0, max_w),
        # Relax all bounds, fall back to max_sharpe
        lambda: _try_optimize(mu, S, "moderate", 0.0, 1.0),
        # Absolute fallback: min volatility, no constraints
        lambda: _try_optimize(mu, S, "conservative", 0.0, 1.0),
    ]
    for attempt in attempts:
        result = attempt()
        if result is not None:
            return result
    return None


def _try_optimize(
    mu: pd.Series,
    S: pd.DataFrame,
    risk_profile: str,
    min_w: float,
    max_w: float,
) -> dict | None:
    try:
        ef = EfficientFrontier(mu, S, weight_bounds=(min_w, max_w))

        if risk_profile == "conservative":
            ef.min_volatility()
        elif risk_profile == "moderate":
            ef.max_sharpe(risk_free_rate=0.05)
        elif risk_profile == "aggressive":
            # Cap target at 95% of maximum achievable return
            max_achievable = float(mu.max()) * 0.95
            target = min(0.25, max_achievable)
            if target <= float(mu.min()):
                ef.max_sharpe(risk_free_rate=0.05)
            else:
                ef.efficient_return(target_return=target)

        return dict(ef.clean_weights())
    except Exception:
        return None


async def compute_efficient_frontier(
    mu: pd.Series,
    S: pd.DataFrame,
    n_points: int = 60,
    min_w: float = 0.0,
    max_w: float = 0.6,
) -> list[dict]:
    points = []
    min_ret = float(mu.min()) + 0.001
    max_ret = float(mu.max()) * 0.95
    if max_ret <= min_ret:
        return points

    target_returns = np.linspace(min_ret, max_ret, n_points)
    for target in target_returns:
        try:
            ef = EfficientFrontier(mu, S, weight_bounds=(min_w, max_w))
            ef.efficient_return(target_return=float(target))
            w = ef.clean_weights()
            perf = ef.portfolio_performance(risk_free_rate=0.05, verbose=False)
            points.append({
                "return": round(perf[0], 4),
                "volatility": round(perf[1], 4),
                "sharpe": round(perf[2], 4),
                "weights": {k: round(v, 4) for k, v in w.items() if v > 0.001},
            })
        except Exception:
            continue
    return points


async def backtest_portfolio(weights: dict, returns: pd.DataFrame) -> list[dict]:
    valid_weights = {k: v for k, v in weights.items() if k in returns.columns and v > 0}
    if not valid_weights:
        return []

    total = sum(valid_weights.values())
    norm_weights = {k: v / total for k, v in valid_weights.items()}

    portfolio_returns = sum(
        returns[ticker] * weight
        for ticker, weight in norm_weights.items()
        if ticker in returns.columns
    )

    cumulative = (1 + portfolio_returns).cumprod().dropna()

    try:
        spy_data = yf.download("SPY", start=str(returns.index[0].date()), auto_adjust=True, progress=False)
        spy_close = spy_data["Close"]
        # yfinance >= 0.2.38 returns multi-level columns; squeeze to Series
        if isinstance(spy_close, pd.DataFrame):
            spy_close = spy_close.iloc[:, 0]
        spy_returns = spy_close.pct_change().dropna()
        spy_cum = (1 + spy_returns).cumprod()
    except Exception:
        spy_cum = pd.Series(dtype=float)

    history = []
    for date, value in cumulative.items():
        spy_value = float(spy_cum.get(date, spy_cum.iloc[-1])) if not spy_cum.empty else 1.0
        history.append({
            "date": str(date.date()),
            "portfolio": round(float(value), 4),
            "benchmark": round(spy_value, 4),
        })
    return history


async def get_correlation_matrix(tickers: list[str], period: str = "1y") -> dict:
    returns = await get_returns_dataframe(tickers, period)
    corr = returns.corr().round(3)
    return {
        "tickers": corr.columns.tolist(),
        "matrix": corr.values.tolist(),
    }
