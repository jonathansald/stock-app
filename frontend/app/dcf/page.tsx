"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getDCFPrefill, calculateDCF, getQuote, getComparables } from "@/lib/api";
import { TickerSearch } from "@/components/portfolio/TickerSearch";
import type {
  DCFResult, DCFPrefill, ComparablesResult, SymbolSearchResult,
} from "@/lib/types";
import { formatCurrency, formatLargeNumber, formatPercent } from "@/lib/formatters";
import {
  Calculator, TrendingUp, TrendingDown, Users, RefreshCw,
  Info, Loader2, X,
} from "lucide-react";

// ── Metric definitions ────────────────────────────────────────────────────────

const METRIC_INFO: Record<string, { name: string; definition: string; formula: string; tip: string }> = {
  "P/E": {
    name: "Price-to-Earnings (P/E)",
    definition: "How much investors pay for each $1 of a company's earnings. A higher P/E means the market expects faster growth or is willing to pay a premium.",
    formula: "P/E = Stock Price ÷ Earnings Per Share (EPS)",
    tip: "Compare within the same industry. A P/E of 30x in tech may be cheap; the same ratio in banking may be expensive.",
  },
  "P/B": {
    name: "Price-to-Book (P/B)",
    definition: "Compares the stock price to the company's net asset value (book value). A P/B below 1x means the market values the company below what's on its balance sheet.",
    formula: "P/B = Stock Price ÷ Book Value Per Share",
    tip: "Most useful for asset-heavy industries (banks, insurance). Less meaningful for software companies where assets are intangible.",
  },
  "P/S": {
    name: "Price-to-Sales (P/S)",
    definition: "Compares the stock price to revenue per share. Useful for companies that aren't yet profitable, since it doesn't depend on earnings.",
    formula: "P/S = Stock Price ÷ Revenue Per Share",
    tip: "A low P/S alone doesn't mean a stock is cheap — a company with thin margins may deserve a low P/S. Compare with peers in the same industry.",
  },
  "EV/EBITDA": {
    name: "Enterprise Value / EBITDA",
    definition: "A capital-structure-neutral valuation multiple. EV includes market cap plus debt minus cash, so it shows the full cost to acquire the business. EBITDA removes financing and accounting differences.",
    formula: "EV/EBITDA = (Market Cap + Debt − Cash) ÷ EBITDA",
    tip: "Better than P/E for comparing companies with different debt levels. 10–15x is typical for mature companies; high-growth firms often trade at 30x+.",
  },
  "ROE": {
    name: "Return on Equity (ROE)",
    definition: "How much profit a company generates for each dollar of shareholder equity. Higher ROE generally signals a more efficient, profitable business.",
    formula: "ROE = Net Income ÷ Shareholders' Equity",
    tip: "A very high ROE can sometimes be caused by heavy debt (which inflates equity away). Always check alongside the debt-to-equity ratio.",
  },
  "Div Yield": {
    name: "Dividend Yield",
    definition: "The annual dividend payment as a percentage of the stock price. Shows how much income you earn from holding the stock, separate from price appreciation.",
    formula: "Dividend Yield = Annual Dividend Per Share ÷ Stock Price",
    tip: "An unusually high yield can be a warning sign — it may mean the market expects the dividend to be cut, or the stock price has fallen sharply.",
  },
  "Mkt Cap": {
    name: "Market Capitalisation",
    definition: "The total market value of a company's outstanding shares. It determines whether a company is classified as small-cap, mid-cap, or large-cap.",
    formula: "Market Cap = Stock Price × Total Shares Outstanding",
    tip: "Market cap is different from enterprise value (EV), which also accounts for debt and cash. Two companies with the same market cap can have very different total acquisition costs.",
  },
};

// Implied-price card descriptions
const IMPLIED_INFO: Record<string, { title: string; how: string }> = {
  "P/E": {
    title: "P/E Implied Price",
    how: "Takes the peer-median P/E ratio and multiplies it by this company's trailing EPS. If peers trade at 25× earnings and this company earns $10/share, the implied price is $250.",
  },
  "P/S": {
    title: "P/S Implied Price",
    how: "Takes the peer-median P/S ratio and multiplies it by this company's revenue per share. Useful when earnings are negative or volatile.",
  },
  "P/B": {
    title: "P/B Implied Price",
    how: "Takes the peer-median P/B ratio and multiplies it by this company's book value per share (net assets ÷ shares). Best for asset-heavy industries.",
  },
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface DCFForm {
  revenue_growth_rates: number[];
  ebit_margin: number;
  tax_rate: number;
  capex_pct: number;
  da_pct: number;
  wacc: number;
  terminal_growth_rate: number;
  shares_outstanding: number;
  net_debt: number;
  current_revenue: number;
}

const DEFAULT_FORM: DCFForm = {
  revenue_growth_rates: [0.10, 0.09, 0.08, 0.07, 0.06],
  ebit_margin: 0.15,
  tax_rate: 0.21,
  capex_pct: 0.05,
  da_pct: 0.03,
  wacc: 0.10,
  terminal_growth_rate: 0.025,
  shares_outstanding: 1_000_000_000,
  net_debt: 0,
  current_revenue: 10_000_000_000,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function mosColor(mos: number | null) {
  if (mos == null) return "text-muted-foreground";
  if (mos >= 0.20) return "text-green-600 dark:text-green-400";
  if (mos >= 0)    return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function mosLabel(mos: number | null) {
  if (mos == null) return "";
  if (mos >= 0.30) return "Significantly undervalued";
  if (mos >= 0.10) return "Potentially undervalued";
  if (mos >= -0.10) return "Fairly valued";
  if (mos >= -0.30) return "Potentially overvalued";
  return "Significantly overvalued";
}

function pctFmt(v: number | null, dec = 1) {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(dec)}%`;
}

function fmtMultiple(v: number | null | undefined) {
  if (v == null) return "—";
  return `${v.toFixed(1)}x`;
}

function fmtMktCap(v: number | null | undefined) {
  if (!v) return "—";
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toFixed(0)}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DCFPage() {
  const [ticker, setTicker]         = useState<string>("");
  const [prefill, setPrefill]        = useState<DCFPrefill | null>(null);
  const [form, setForm]              = useState<DCFForm>(DEFAULT_FORM);
  const [result, setResult]          = useState<DCFResult | null>(null);
  const [comps, setComps]            = useState<ComparablesResult | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [loadingData, setLoadingData]   = useState(false);
  const [calculating, setCalculating]   = useState(false);
  const [loadingComps, setLoadingComps] = useState(false);
  const [error, setError]            = useState<string | null>(null);
  const [autoCalcPending, setAutoCalcPending] = useState(false);
  const [openMetric, setOpenMetric]  = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load ticker data ───────────────────────────────────────────────────────

  const handleSelect = async (selected: SymbolSearchResult) => {
    const upper = selected.ticker.toUpperCase();
    setTicker(upper);
    setLoadingData(true);
    setError(null);
    setResult(null);
    setComps(null);
    try {
      const [pf, q] = await Promise.allSettled([getDCFPrefill(upper), getQuote(upper)]);

      if (pf.status === "fulfilled") {
        const p = pf.value;
        setPrefill(p);
        const growthSeed = p.revenue_growth_suggestion ?? 0.08;
        setForm((prev) => ({
          ...prev,
          revenue_growth_rates: [
            growthSeed,
            growthSeed * 0.9,
            growthSeed * 0.8,
            growthSeed * 0.7,
            Math.max(growthSeed * 0.6, 0.02),
          ],
          ebit_margin:           p.ebit_margin_suggestion ?? prev.ebit_margin,
          da_pct:                p.da_pct_suggestion      ?? prev.da_pct,
          capex_pct:             p.capex_pct_suggestion   ?? prev.capex_pct,
          tax_rate:              p.tax_rate_suggestion    ?? prev.tax_rate,
          wacc:                  p.wacc_suggestion        ?? prev.wacc,
          terminal_growth_rate:  p.tgr_suggestion         ?? prev.terminal_growth_rate,
          shares_outstanding:    p.shares_outstanding     ?? prev.shares_outstanding,
          net_debt:              p.net_debt               ?? prev.net_debt,
          current_revenue:       p.current_revenue        ?? prev.current_revenue,
        }));
        setAutoCalcPending(true);
      } else {
        setError(`Could not load financial data for ${upper}. Check the ticker and ensure FMP_KEY is configured.`);
      }
      if (q.status === "fulfilled") setCurrentPrice(q.value.price);
    } finally {
      setLoadingData(false);
    }

    // Load comparables in parallel (non-blocking)
    setLoadingComps(true);
    getComparables(upper)
      .then((c) => setComps(c))
      .catch(() => setComps(null))
      .finally(() => setLoadingComps(false));
  };

  // ── Auto-calculate when prefill loads or form changes ─────────────────────

  const runCalculate = useCallback(async (f: DCFForm, price: number | null, sym: string) => {
    if (!sym) return;
    setCalculating(true);
    try {
      const res = await calculateDCF(sym, { ...f, current_price: price });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Calculation failed");
    } finally {
      setCalculating(false);
    }
  }, []);

  // Trigger auto-calc once after prefill is set
  useEffect(() => {
    if (!autoCalcPending || !ticker) return;
    setAutoCalcPending(false);
    runCalculate(form, currentPrice, ticker);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCalcPending]);

  // Debounced recalc on form changes (after first result)
  useEffect(() => {
    if (!result || !ticker) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runCalculate(form, currentPrice, ticker);
    }, 900);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  const setGrowth = (i: number, val: number) => {
    const rates = [...form.revenue_growth_rates];
    rates[i] = val / 100;
    setForm({ ...form, revenue_growth_rates: rates });
  };

  const setAssumption = (key: keyof DCFForm, val: number) =>
    setForm({ ...form, [key]: val / 100 });

  const loaded = !!prefill && !!ticker;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">

      {/* ── Header ── */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Calculator className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Valuation Suite</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          DCF intrinsic value · peer comparables · relative valuation — search any stock to begin
        </p>
      </div>

      {/* ── Stock search ── */}
      <div className="max-w-xl mb-6">
        <TickerSearch onSelect={handleSelect} disabled={loadingData} />
      </div>

      {loadingData && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading financial data…
        </div>
      )}

      {error && !loadingData && (
        <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ── Stock header ── */}
      {loaded && (
        <div className="mb-6 rounded-xl border bg-card px-5 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary shrink-0">
              {ticker.slice(0, 4)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg leading-tight">{ticker}</span>
                {prefill.ticker && (
                  <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">{prefill.ticker}</span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {comps?.target.sector && <span>{comps.target.sector}</span>}
                {comps?.target.industry && <><span>·</span><span>{comps.target.industry}</span></>}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-4">
            {currentPrice && (
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Current Price</p>
                <p className="text-lg font-bold">{formatCurrency(currentPrice)}</p>
              </div>
            )}
            {comps?.target.pe_ratio && (
              <div className="text-right">
                <p className="text-xs text-muted-foreground">P/E (TTM)</p>
                <p className="font-semibold">{fmtMultiple(comps.target.pe_ratio)}</p>
              </div>
            )}
            {comps?.target.ev_ebitda && (
              <div className="text-right">
                <p className="text-xs text-muted-foreground">EV/EBITDA</p>
                <p className="font-semibold">{fmtMultiple(comps.target.ev_ebitda)}</p>
              </div>
            )}
            {comps?.target.market_cap && (
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Market Cap</p>
                <p className="font-semibold">{fmtMktCap(comps.target.market_cap)}</p>
              </div>
            )}
            {prefill?.analyst_target && (
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Analyst Target</p>
                <p className="font-semibold text-blue-600 dark:text-blue-400">{formatCurrency(prefill.analyst_target)}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 1: DCF Intrinsic Value
      ═══════════════════════════════════════════════════════════════════════ */}
      {loaded && (
        <>
          <SectionHeader icon={<Calculator className="h-4 w-4 text-primary" />} title="DCF — Intrinsic Value">
            Estimates fair value from projected free cash flows discounted to today.
            Adjust assumptions with the sliders — results update automatically.
          </SectionHeader>

          <div className="grid gap-6 lg:grid-cols-5 mt-4">

            {/* ── Left: Assumptions (2 cols wide) ── */}
            <div className="lg:col-span-2 space-y-4">

              {/* Revenue growth */}
              <div className="rounded-xl border bg-card p-5">
                <h3 className="font-semibold text-sm mb-3">Revenue Growth — Years 1–5</h3>
                <div className="space-y-2">
                  {form.revenue_growth_rates.map((rate, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-10 text-xs text-muted-foreground shrink-0">Yr {i + 1}</span>
                      <input
                        type="range" min="-20" max="50" step="0.5"
                        value={+(rate * 100).toFixed(1)}
                        onChange={(e) => setGrowth(i, +e.target.value)}
                        className="flex-1 accent-primary"
                      />
                      <div className="flex items-center gap-1 shrink-0">
                        <input
                          type="number" min={-20} max={50} step={0.5}
                          value={+(rate * 100).toFixed(1)}
                          onChange={(e) => setGrowth(i, +e.target.value)}
                          className={`w-16 text-right text-sm font-semibold tabular-nums border rounded px-1.5 py-0.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary ${rate < 0 ? "text-red-500" : "text-foreground"}`}
                        />
                        <span className="text-xs text-muted-foreground">%</span>
                      </div>
                    </div>
                  ))}
                </div>
                {prefill?.historical_growth_rates.length > 0 && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Historical avg: <strong>{formatPercent(prefill.revenue_growth_suggestion)}</strong>
                    {" "}(last {prefill.historical_growth_rates.length} yrs)
                  </p>
                )}
              </div>

              {/* Valuation assumptions */}
              <div className="rounded-xl border bg-card p-5">
                <h3 className="font-semibold text-sm mb-3">Valuation Assumptions</h3>
                <div className="space-y-4">
                  {([
                    { label: "EBIT Margin",        key: "ebit_margin",         min: 0, max: 60, help: "Operating profit ÷ revenue.", ref: prefill?.ebit_margin_suggestion },
                    { label: "WACC",               key: "wacc",                min: 4, max: 20, help: "Discount rate calibrated to analyst consensus. Lower = higher valuation.", ref: prefill?.wacc_suggestion },
                    { label: "Terminal Growth",    key: "terminal_growth_rate", min: 0, max: 5,  help: "Long-run growth after Yr 5. ~3% for dominant franchises.", ref: prefill?.tgr_suggestion },
                    { label: "Tax Rate",           key: "tax_rate",            min: 0, max: 40, help: "Effective corporate tax rate.", ref: prefill?.tax_rate_suggestion },
                    { label: "CapEx % Revenue",    key: "capex_pct",           min: 0, max: 30, help: "Avg historical CapEx. Lower if investment phase ends.", ref: prefill?.capex_pct_suggestion },
                    { label: "D&A % Revenue",      key: "da_pct",              min: 0, max: 20, help: "Non-cash add-back to NOPAT.", ref: prefill?.da_pct_suggestion },
                  ] as { label: string; key: keyof DCFForm; min: number; max: number; help: string; ref: number | null | undefined }[]).map(({ label, key, min, max, help, ref }) => {
                    const val = (form[key] as number) * 100;
                    return (
                      <div key={key}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium">{label}</span>
                          <div className="flex items-center gap-1">
                            <input
                              type="number" min={min} max={max} step={0.1}
                              value={val.toFixed(1)}
                              onChange={(e) => setAssumption(key, +e.target.value)}
                              className="w-20 text-right text-sm font-bold tabular-nums border rounded px-2 py-0.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary text-primary"
                            />
                            <span className="text-xs text-muted-foreground">%</span>
                          </div>
                        </div>
                        <input
                          type="range" min={min} max={max} step="0.1"
                          value={val}
                          onChange={(e) => setAssumption(key, +e.target.value)}
                          className="w-full accent-primary"
                        />
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {help}
                          {ref != null && (
                            <span className="ml-1">
                              Historical avg: <strong>{(ref * 100).toFixed(1)}%</strong>.
                            </span>
                          )}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Context: revenue history */}
              {prefill && (
                <div className="rounded-xl border bg-card p-5">
                  <h3 className="font-semibold text-sm mb-2.5">Historical Snapshot</h3>
                  <div className="space-y-1.5 text-sm">
                    <Row label="Latest Revenue"    value={formatLargeNumber(prefill.current_revenue)} />
                    <Row label="Shares Outstanding" value={formatLargeNumber(prefill.shares_outstanding)} />
                    <Row label="Net Debt"          value={formatLargeNumber(prefill.net_debt)} />
                    {currentPrice && (
                      <Row label="Current Price"   value={formatCurrency(currentPrice)} />
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── Right: Results (3 cols wide) ── */}
            <div className="lg:col-span-3 space-y-4">

              {calculating && !result && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground rounded-xl border bg-card p-8 justify-center">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Calculating intrinsic value…
                </div>
              )}

              {result && (
                <>
                  {/* Headline result */}
                  <div className="rounded-xl border bg-card p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold">Valuation Result</h3>
                      {calculating && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <RefreshCw className="h-3 w-3 animate-spin" />Recalculating…
                        </div>
                      )}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <ResultPill
                        label="Intrinsic Value"
                        value={formatCurrency(result.intrinsic_value_per_share)}
                        accent="text-primary"
                        large
                      />
                      {result.current_price && (
                        <ResultPill label="Current Price" value={formatCurrency(result.current_price)} />
                      )}
                      {result.margin_of_safety != null && (
                        <div className={`rounded-xl border p-4 text-center ${result.margin_of_safety >= 0 ? "bg-green-50/60 border-green-200 dark:bg-green-950/20 dark:border-green-900" : "bg-red-50/60 border-red-200 dark:bg-red-950/20 dark:border-red-900"}`}>
                          <p className="text-xs text-muted-foreground mb-1">Margin of Safety</p>
                          <p className={`text-2xl font-bold ${mosColor(result.margin_of_safety)}`}>
                            {result.margin_of_safety >= 0 ? "+" : ""}{(result.margin_of_safety * 100).toFixed(1)}%
                          </p>
                          <p className={`text-xs mt-0.5 ${mosColor(result.margin_of_safety)}`}>
                            {mosLabel(result.margin_of_safety)}
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                      <Row label="Enterprise Value" value={formatLargeNumber(result.enterprise_value)} />
                      <Row label="Equity Value"     value={formatLargeNumber(result.equity_value)} />
                      <Row label="PV Terminal Value" value={formatLargeNumber(result.pv_terminal_value)} />
                    </div>
                  </div>

                  {/* Year-by-year table */}
                  <div className="rounded-xl border bg-card p-5">
                    <h3 className="font-semibold text-sm mb-3">Year-by-Year Projections</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            {["Year", "Revenue", "EBIT", "Free Cash Flow", "PV of FCF"].map((h) => (
                              <th key={h} className={`py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide ${h === "Year" ? "text-left" : "text-right"}`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {result.projections.map((p) => (
                            <tr key={p.year} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                              <td className="py-2 font-medium">Year {p.year}</td>
                              <td className="py-2 text-right tabular-nums">{formatLargeNumber(p.revenue)}</td>
                              <td className="py-2 text-right tabular-nums">{formatLargeNumber(p.ebit)}</td>
                              <td className={`py-2 text-right tabular-nums ${p.fcf < 0 ? "text-red-500" : ""}`}>{formatLargeNumber(p.fcf)}</td>
                              <td className="py-2 text-right tabular-nums">{formatLargeNumber(p.pv_fcf)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Sensitivity */}
                  {result.sensitivity_table && (
                    <div className="rounded-xl border bg-card p-5">
                      <h3 className="font-semibold text-sm mb-1">Sensitivity — WACC × Terminal Growth Rate</h3>
                      <p className="text-xs text-muted-foreground mb-3">
                        Intrinsic value / share. <span className="font-medium text-primary">Blue column</span> = your current WACC.
                        Green = above current price, red = below.
                      </p>
                      <div className="overflow-x-auto">
                        <table className="text-xs">
                          <thead>
                            <tr>
                              <th className="pr-3 py-1 text-left text-muted-foreground font-medium">WACC ↓ / TGR →</th>
                              {result.tgr_range.map((tgr) => (
                                <th key={tgr} className="px-2 py-1 text-right text-muted-foreground font-medium">{(tgr * 100).toFixed(1)}%</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {result.wacc_range.map((wacc) => {
                              const isBaseWacc = Math.abs(wacc - form.wacc) < 0.002;
                              return (
                                <tr key={wacc} className={`border-t ${isBaseWacc ? "bg-primary/5" : ""}`}>
                                  <td className={`pr-3 py-1.5 font-semibold ${isBaseWacc ? "text-primary" : "text-muted-foreground"}`}>
                                    {(wacc * 100).toFixed(1)}%
                                  </td>
                                  {result.tgr_range.map((tgr) => {
                                    const val = result.sensitivity_table[String(Math.round(wacc * 1000) / 1000)]?.[String(Math.round(tgr * 1000) / 1000)];
                                    const above = result.current_price && val > result.current_price;
                                    return (
                                      <td key={tgr} className={`px-2 py-1.5 text-right tabular-nums font-medium ${isBaseWacc ? "font-bold" : ""} ${above ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                                        {val != null ? formatCurrency(val, 0) : "—"}
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}

              {!result && !calculating && loaded && (
                <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
                  <Calculator className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  Adjust any assumption above and results will appear automatically.
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 2: Relative Valuation / Comparables
      ═══════════════════════════════════════════════════════════════════════ */}
      {(loaded || loadingComps) && (
        <div className="mt-10">
          <SectionHeader icon={<Users className="h-4 w-4 text-violet-500" />} title="Relative Valuation — Peer Comparables">
            How does {ticker || "the stock"} trade vs its industry peers?
            Peer median multiples applied to {ticker || "the"} fundamentals give implied share prices.
          </SectionHeader>

          {loadingComps && (
            <div className="flex items-center gap-2 mt-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />Loading peer data…
            </div>
          )}

          {comps && !loadingComps && (
            <div className="mt-4 space-y-5">

              {/* Implied valuations */}
              {Object.keys(comps.implied_prices).length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {Object.entries(comps.implied_prices).map(([key, ip]) => {
                    if (!ip) return null;
                    const up = ip.upside_pct != null && ip.upside_pct >= 0;
                    const impliedKey = `implied-${ip.multiple_name}`;
                    const isOpen = openMetric === impliedKey;
                    const info = IMPLIED_INFO[ip.multiple_name];
                    return (
                      <div key={key} className="rounded-xl border bg-card p-4 relative">
                        <div className="flex items-center justify-between mb-2">
                          <button
                            onClick={() => setOpenMetric(isOpen ? null : impliedKey)}
                            className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors group"
                          >
                            {ip.multiple_name} Implied
                            <Info className="h-3 w-3 opacity-50 group-hover:opacity-100" />
                          </button>
                          <span className="text-xs bg-muted rounded-full px-2 py-0.5 font-mono">{ip.multiple_name} {fmtMultiple(ip.multiple)}</span>
                        </div>
                        {isOpen && info && (
                          <div className="mb-3 rounded-lg bg-muted/60 border px-3 py-2.5 text-xs leading-relaxed">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <span className="font-semibold text-foreground">{info.title}</span>
                              <button onClick={() => setOpenMetric(null)} className="text-muted-foreground hover:text-foreground shrink-0"><X className="h-3 w-3" /></button>
                            </div>
                            <p className="text-muted-foreground mb-1.5">{info.how}</p>
                            <p className="font-mono text-[10px] bg-background rounded px-2 py-1 text-primary">
                              {ip.multiple_name} × {ip.metric_label} = Implied Price
                            </p>
                          </div>
                        )}
                        <p className="text-2xl font-bold">{formatCurrency(ip.implied_price)}</p>
                        {ip.upside_pct != null && (
                          <p className={`flex items-center gap-0.5 text-xs font-semibold mt-1 ${up ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                            {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            {pctFmt(ip.upside_pct)} vs current
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">
                          {ip.metric_label}: <strong>{formatCurrency(ip.metric_value)}</strong>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Peer median: <strong>{fmtMultiple(ip.multiple)}</strong>
                        </p>
                      </div>
                    );
                  })}
                  {comps.composite_implied && comps.current_price && (
                    <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4">
                      <button
                        onClick={() => setOpenMetric(openMetric === "composite" ? null : "composite")}
                        className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-primary mb-2 hover:opacity-80 transition-opacity group"
                      >
                        Composite Average
                        <Info className="h-3 w-3 opacity-60 group-hover:opacity-100" />
                      </button>
                      {openMetric === "composite" && (
                        <div className="mb-3 rounded-lg bg-muted/60 border px-3 py-2.5 text-xs leading-relaxed">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <span className="font-semibold text-foreground">Composite Implied Price</span>
                            <button onClick={() => setOpenMetric(null)} className="text-muted-foreground hover:text-foreground shrink-0"><X className="h-3 w-3" /></button>
                          </div>
                          <p className="text-muted-foreground">Simple average of all multiple-implied prices (P/E, P/S, P/B). Blending methods reduces the impact of any single metric being skewed by unusual data.</p>
                        </div>
                      )}
                      <p className="text-2xl font-bold text-primary">{formatCurrency(comps.composite_implied)}</p>
                      {(() => {
                        const upside = (comps.composite_implied / comps.current_price - 1) * 100;
                        const up2 = upside >= 0;
                        return (
                          <p className={`flex items-center gap-0.5 text-xs font-semibold mt-1 ${up2 ? "text-green-600" : "text-red-500"}`}>
                            {up2 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            {pctFmt(upside)} vs current
                          </p>
                        );
                      })()}
                      <p className="text-xs text-muted-foreground mt-2">Average of all multiple-implied prices</p>
                    </div>
                  )}
                </div>
              )}

              {/* Peer multiples table */}
              <div className="rounded-xl border bg-card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="font-semibold text-sm">Peer Multiples Comparison</h3>
                  <span className="text-xs bg-muted rounded-full px-2 py-0.5 text-muted-foreground">
                    {comps.peers.length} comparable companies
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        {["Company", "Price", "Mkt Cap", "P/E", "P/B", "P/S", "EV/EBITDA", "ROE", "Div Yield"].map((h) => (
                          <th key={h} className={`py-2 pb-2.5 text-xs font-semibold uppercase tracking-wide ${h === "Company" ? "text-left pr-4" : "text-right px-2"}`}>
                            {METRIC_INFO[h] ? (
                              <button
                                onClick={() => setOpenMetric(openMetric === `col-${h}` ? null : `col-${h}`)}
                                className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors group cursor-pointer"
                              >
                                {h}
                                <Info className="h-3 w-3 opacity-40 group-hover:opacity-100 ml-0.5" />
                              </button>
                            ) : (
                              <span className="text-muted-foreground">{h}</span>
                            )}
                          </th>
                        ))}
                      </tr>
                      {/* Metric explanation panel */}
                      {openMetric?.startsWith("col-") && (() => {
                        const key = openMetric.replace("col-", "");
                        const info = METRIC_INFO[key];
                        if (!info) return null;
                        return (
                          <tr>
                            <td colSpan={9} className="pt-0 pb-3">
                              <div className="rounded-lg border bg-muted/50 px-4 py-3 text-xs leading-relaxed">
                                <div className="flex items-start justify-between gap-4 mb-1.5">
                                  <span className="font-semibold text-foreground text-sm">{info.name}</span>
                                  <button onClick={() => setOpenMetric(null)} className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5"><X className="h-3.5 w-3.5" /></button>
                                </div>
                                <p className="text-muted-foreground mb-2">{info.definition}</p>
                                <div className="font-mono text-[11px] bg-background border rounded px-3 py-1.5 text-primary inline-block mb-2">
                                  {info.formula}
                                </div>
                                <p className="text-muted-foreground"><span className="font-medium text-foreground">Tip: </span>{info.tip}</p>
                              </div>
                            </td>
                          </tr>
                        );
                      })()}
                    </thead>
                    <tbody>
                      {/* Target row (highlighted) */}
                      <PeerRow company={comps.target} isTarget />
                      {/* Peers */}
                      {comps.peers.map((p) => <PeerRow key={p.symbol} company={p} />)}
                      {/* Median row */}
                      {comps.peers.length > 1 && (
                        <tr className="border-t-2 border-primary/20 bg-primary/5">
                          <td className="py-2 pr-4 text-xs font-bold text-primary uppercase tracking-wide">Peer Median</td>
                          <td className="py-2 px-2 text-right text-xs text-muted-foreground">—</td>
                          <td className="py-2 px-2 text-right text-xs text-muted-foreground">—</td>
                          <td className="py-2 px-2 text-right text-xs font-semibold text-primary">{fmtMultiple(comps.peer_medians.pe)}</td>
                          <td className="py-2 px-2 text-right text-xs font-semibold text-primary">{fmtMultiple(comps.peer_medians.pb)}</td>
                          <td className="py-2 px-2 text-right text-xs font-semibold text-primary">{fmtMultiple(comps.peer_medians.ps)}</td>
                          <td className="py-2 px-2 text-right text-xs font-semibold text-primary">{fmtMultiple(comps.peer_medians.ev_ebitda)}</td>
                          <td className="py-2 px-2 text-right text-xs text-muted-foreground">—</td>
                          <td className="py-2 px-2 text-right text-xs text-muted-foreground">—</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Interpretation */}
              {result && comps.composite_implied && comps.current_price && (
                <ValuationSummary
                  dcfValue={result.intrinsic_value_per_share}
                  compsValue={comps.composite_implied}
                  currentPrice={comps.current_price}
                  ticker={ticker}
                  mosSafety={result.margin_of_safety}
                />
              )}

              <p className="text-xs text-muted-foreground">
                Comparables use TTM (trailing twelve months) data. All valuations are estimates — not financial advice.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Intro when no stock selected */}
      {!loaded && !loadingData && (
        <div className="mt-16 text-center">
          <Calculator className="h-16 w-16 mx-auto text-muted-foreground/20 mb-4" />
          <h2 className="text-lg font-semibold text-muted-foreground">Search for any stock above to begin</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            We'll pull historical financials, pre-fill DCF assumptions, find comparable peers, and calculate implied valuations automatically.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionHeader({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted mt-0.5">{icon}</div>
      <div>
        <h2 className="font-bold text-base">{title}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{children}</p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1 border-b last:border-0">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="font-medium text-sm">{value}</span>
    </div>
  );
}

function ResultPill({ label, value, accent, large }: { label: string; value: string; accent?: string; large?: boolean }) {
  return (
    <div className="rounded-xl border bg-muted/30 p-4 text-center">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`font-bold ${large ? "text-2xl" : "text-xl"} ${accent ?? "text-foreground"}`}>{value}</p>
    </div>
  );
}

function PeerRow({ company, isTarget }: { company: import("@/lib/types").ComparableCompany; isTarget?: boolean }) {
  const rowClass = isTarget
    ? "border-b bg-primary/5 font-semibold"
    : "border-b hover:bg-muted/20 transition-colors";

  return (
    <tr className={rowClass}>
      <td className="py-2 pr-4">
        <div className="flex items-center gap-2">
          {isTarget && (
            <span className="rounded-full bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 font-bold leading-none shrink-0">YOU</span>
          )}
          <span className="font-semibold text-xs">{company.symbol}</span>
          <span className="text-xs text-muted-foreground truncate max-w-[120px]">{company.name}</span>
        </div>
      </td>
      <td className="py-2 px-2 text-right text-xs tabular-nums">{company.price ? formatCurrency(company.price) : "—"}</td>
      <td className="py-2 px-2 text-right text-xs tabular-nums">{fmtMktCap(company.market_cap)}</td>
      <td className="py-2 px-2 text-right text-xs tabular-nums font-medium">{fmtMultiple(company.pe_ratio)}</td>
      <td className="py-2 px-2 text-right text-xs tabular-nums">{fmtMultiple(company.pb_ratio)}</td>
      <td className="py-2 px-2 text-right text-xs tabular-nums">{fmtMultiple(company.ps_ratio)}</td>
      <td className="py-2 px-2 text-right text-xs tabular-nums">{fmtMultiple(company.ev_ebitda)}</td>
      <td className="py-2 px-2 text-right text-xs tabular-nums">
        {company.roe != null ? `${(company.roe * 100).toFixed(1)}%` : "—"}
      </td>
      <td className="py-2 px-2 text-right text-xs tabular-nums">
        {company.dividend_yield != null ? `${(company.dividend_yield * 100).toFixed(1)}%` : "—"}
      </td>
    </tr>
  );
}

function ValuationSummary({
  dcfValue, compsValue, currentPrice, ticker, mosSafety,
}: {
  dcfValue: number; compsValue: number; currentPrice: number; ticker: string; mosSafety: number | null;
}) {
  const avg = (dcfValue + compsValue) / 2;
  const avgUpside = (avg / currentPrice - 1) * 100;
  const dcfUpside = (dcfValue / currentPrice - 1) * 100;
  const compsUpside = (compsValue / currentPrice - 1) * 100;

  const bullish = avgUpside > 10;
  const bearish = avgUpside < -10;

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2 mb-3">
        <Info className="h-4 w-4 text-primary shrink-0" />
        <h3 className="font-semibold text-sm">Valuation Summary — {ticker}</h3>
      </div>
      <div className="grid gap-3 sm:grid-cols-3 mb-4 text-sm">
        <div className="rounded-lg bg-muted/40 p-3 text-center">
          <p className="text-xs text-muted-foreground mb-0.5">DCF Value</p>
          <p className="font-bold text-lg">{formatCurrency(dcfValue)}</p>
          <p className={`text-xs font-medium ${dcfUpside >= 0 ? "text-green-600" : "text-red-500"}`}>
            {pctFmt(dcfUpside)} vs current
          </p>
        </div>
        <div className="rounded-lg bg-muted/40 p-3 text-center">
          <p className="text-xs text-muted-foreground mb-0.5">Comps Value</p>
          <p className="font-bold text-lg">{formatCurrency(compsValue)}</p>
          <p className={`text-xs font-medium ${compsUpside >= 0 ? "text-green-600" : "text-red-500"}`}>
            {pctFmt(compsUpside)} vs current
          </p>
        </div>
        <div className={`rounded-lg p-3 text-center ${bullish ? "bg-green-50/60 dark:bg-green-950/20" : bearish ? "bg-red-50/60 dark:bg-red-950/20" : "bg-muted/40"}`}>
          <p className="text-xs text-muted-foreground mb-0.5">Blended Average</p>
          <p className="font-bold text-lg">{formatCurrency(avg)}</p>
          <p className={`text-xs font-medium ${bullish ? "text-green-600" : bearish ? "text-red-500" : "text-muted-foreground"}`}>
            {pctFmt(avgUpside)} vs current
          </p>
        </div>
      </div>
      <div className="rounded-lg bg-muted/40 px-4 py-3 text-xs text-muted-foreground leading-relaxed">
        <strong className="text-foreground">Interpretation:</strong>{" "}
        {bullish
          ? `Both methods suggest ${ticker} may be trading below fair value. The DCF intrinsic value is ${formatCurrency(dcfValue)} (${pctFmt(dcfUpside)} upside) and peer comparables imply ${formatCurrency(compsValue)} (${pctFmt(compsUpside)} upside). The blended average of ${formatCurrency(avg)} represents ${pctFmt(avgUpside)} potential upside.`
          : bearish
          ? `Both methods suggest ${ticker} may be trading above fair value. The DCF intrinsic value is ${formatCurrency(dcfValue)} and peer comparables imply ${formatCurrency(compsValue)}, both below the current price. This could indicate the market is pricing in future growth not captured by trailing data.`
          : `The two methods give a mixed picture. DCF implies ${formatCurrency(dcfValue)} (${pctFmt(dcfUpside)}) while peers imply ${formatCurrency(compsValue)} (${pctFmt(compsUpside)}). Blended fair value estimate: ${formatCurrency(avg)}.`
        }
        {" "}<span className="opacity-70">This is a quantitative estimate, not financial advice. Use alongside qualitative research.</span>
      </div>
    </div>
  );
}
