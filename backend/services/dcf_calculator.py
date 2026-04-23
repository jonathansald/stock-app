def calculate_dcf(
    current_revenue: float,
    revenue_growth_rates: list[float],
    ebit_margin: float,
    tax_rate: float,
    capex_pct: float,
    da_pct: float,
    wacc: float,
    terminal_growth_rate: float,
    shares_outstanding: float,
    net_debt: float,
) -> dict:
    projections = []
    revenue = current_revenue

    for i, growth_rate in enumerate(revenue_growth_rates):
        revenue = revenue * (1 + growth_rate)
        ebit = revenue * ebit_margin
        nopat = ebit * (1 - tax_rate)
        da = revenue * da_pct
        capex = revenue * capex_pct
        fcf = nopat + da - capex
        discount_factor = (1 + wacc) ** (i + 1)
        pv_fcf = fcf / discount_factor
        projections.append({
            "year": i + 1,
            "revenue": round(revenue),
            "ebit": round(ebit),
            "fcf": round(fcf),
            "pv_fcf": round(pv_fcf),
        })

    terminal_fcf = projections[-1]["fcf"] * (1 + terminal_growth_rate)
    terminal_value = terminal_fcf / (wacc - terminal_growth_rate)
    pv_terminal = terminal_value / (1 + wacc) ** len(revenue_growth_rates)

    total_pv_fcf = sum(p["pv_fcf"] for p in projections)
    enterprise_value = total_pv_fcf + pv_terminal
    equity_value = enterprise_value - net_debt
    intrinsic_value_per_share = equity_value / shares_outstanding if shares_outstanding else 0

    return {
        "projections": projections,
        "pv_fcf_sum": round(total_pv_fcf),
        "terminal_value": round(terminal_value),
        "pv_terminal_value": round(pv_terminal),
        "enterprise_value": round(enterprise_value),
        "equity_value": round(equity_value),
        "intrinsic_value_per_share": round(intrinsic_value_per_share, 2),
    }


def sensitivity_table(
    base_params: dict,
    wacc_range: list[float],
    tgr_range: list[float],
) -> dict:
    table = {}
    for wacc in wacc_range:
        table[str(round(wacc, 3))] = {}
        for tgr in tgr_range:
            params = {**base_params, "wacc": wacc, "terminal_growth_rate": tgr}
            result = calculate_dcf(**params)
            table[str(round(wacc, 3))][str(round(tgr, 3))] = result["intrinsic_value_per_share"]
    return table
