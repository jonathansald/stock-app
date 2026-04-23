"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TickerSearch } from "@/components/portfolio/TickerSearch";
import { RiskToleranceSlider } from "@/components/portfolio/RiskToleranceSlider";
import { Button } from "@/components/ui/button";
import { optimizePortfolio } from "@/lib/api";
import type { SymbolSearchResult } from "@/lib/types";
import { useWatchlist } from "@/components/providers/WatchlistProvider";
import { X, TrendingUp, Settings2, Clock, Bookmark, Check } from "lucide-react";

type RiskProfile = "conservative" | "moderate" | "aggressive";

export default function PortfolioPage() {
  return (
    <Suspense>
      <PortfolioPageInner />
    </Suspense>
  );
}

function PortfolioPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { items: watchlistItems } = useWatchlist();
  const [tickers, setTickers] = useState<SymbolSearchResult[]>([]);
  const [riskProfile, setRiskProfile] = useState<RiskProfile>("moderate");
  const [period, setPeriod] = useState("2y");
  const [investmentAmount, setInvestmentAmount] = useState<string>("");
  const [minWeight, setMinWeight] = useState(0);
  const [maxWeight, setMaxWeight] = useState(40);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const param = searchParams.get("tickers");
    if (!param) return;
    const tickerList = param.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);
    const fromWatchlist: SymbolSearchResult[] = tickerList.map((t) => {
      const wItem = watchlistItems.find((w) => w.ticker === t);
      return { ticker: t, name: wItem?.name ?? t, type: "Common Stock" };
    });
    setTickers(fromWatchlist);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addTicker = (result: SymbolSearchResult) => {
    if (tickers.find((t) => t.ticker === result.ticker)) return;
    if (tickers.length >= 20) return;
    setTickers((prev) => [...prev, result]);
  };

  const removeTicker = (ticker: string) => {
    setTickers((prev) => prev.filter((t) => t.ticker !== ticker));
  };

  const handleOptimize = async () => {
    if (tickers.length < 2) {
      setError("Add at least 2 stocks to optimize a portfolio.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await optimizePortfolio({
        tickers: tickers.map((t) => t.ticker),
        risk_profile: riskProfile,
        period,
        min_weight: minWeight / 100,
        max_weight: maxWeight / 100,
      });
      sessionStorage.setItem("portfolioResult", JSON.stringify(result));
      const amt = parseFloat(investmentAmount.replace(/[^0-9.]/g, ""));
      if (!isNaN(amt) && amt > 0) {
        sessionStorage.setItem("investmentAmount", String(amt));
      } else {
        sessionStorage.removeItem("investmentAmount");
      }
      router.push("/portfolio/results");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Optimization failed. Try different stocks or a longer time period.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Portfolio Builder</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Select stocks, set your constraints, and get a mathematically optimal allocation based on Modern Portfolio Theory.
        </p>
      </div>

      <div className="space-y-5">
        {/* Stock selection */}
        <section className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold mb-3">Stocks</h2>
          <TickerSearch onSelect={addTicker} disabled={tickers.length >= 20} />

          {/* Watchlist quick-add */}
          {watchlistItems.length > 0 && (
            <div className="mt-3">
              <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground mb-1.5">
                <Bookmark className="h-3 w-3" />
                Your watchlist — click to add
              </p>
              <div className="flex flex-wrap gap-1.5">
                {watchlistItems.map((item) => {
                  const already = tickers.some((t) => t.ticker === item.ticker);
                  return (
                    <button
                      key={item.ticker}
                      onClick={() => !already && addTicker({ ticker: item.ticker, name: item.name, type: "Common Stock" })}
                      disabled={already || tickers.length >= 20}
                      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all ${
                        already
                          ? "border-primary/40 bg-primary/10 text-primary cursor-default"
                          : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:bg-muted hover:text-foreground"
                      } disabled:opacity-50`}
                    >
                      <span className="font-bold">{item.ticker}</span>
                      <span className="hidden sm:inline opacity-70 max-w-[80px] truncate">{item.name}</span>
                      {already && <Check className="h-3 w-3 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Selected tickers */}
          {tickers.length > 0 ? (
            <div className="mt-3">
              <p className="text-xs font-medium text-muted-foreground mb-1.5">
                Selected ({tickers.length}/20)
              </p>
              <div className="flex flex-wrap gap-2">
                {tickers.map((t) => (
                  <div
                    key={t.ticker}
                    className="flex items-center gap-1.5 rounded-lg border bg-primary/5 border-primary/20 px-2.5 py-1.5 text-sm"
                  >
                    <span className="font-semibold text-foreground">{t.ticker}</span>
                    <span className="text-muted-foreground max-w-[100px] truncate text-xs hidden sm:inline">{t.name}</span>
                    <button
                      onClick={() => removeTicker(t.ticker)}
                      className="ml-0.5 rounded text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Add at least 2 stocks to build a portfolio.</p>
          )}
        </section>

        {/* Risk tolerance */}
        <section className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold mb-3">Risk Tolerance</h2>
          <RiskToleranceSlider value={riskProfile} onChange={setRiskProfile} />
        </section>

        {/* Constraints */}
        <section className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold">Allocation Constraints</h2>
          </div>
          <div className="space-y-5">
            {/* Max weight */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium">Max per stock</label>
                <span className="text-sm font-bold text-primary w-10 text-right">{maxWeight}%</span>
              </div>
              <input
                type="range"
                min={10}
                max={100}
                step={5}
                value={maxWeight}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setMaxWeight(v);
                  if (minWeight >= v) setMinWeight(Math.max(0, v - 5));
                }}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
                <span>10%</span><span>100%</span>
              </div>
            </div>

            {/* Min weight */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium">Min per stock</label>
                <span className="text-sm font-bold text-primary w-10 text-right">{minWeight}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={20}
                step={1}
                value={minWeight}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setMinWeight(v);
                  if (v >= maxWeight) setMaxWeight(Math.min(100, v + 5));
                }}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
                <span>0% (no min)</span><span>20%</span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Max caps concentration risk. Min forces diversification — set to 0 to let the optimizer decide.
            </p>
          </div>
        </section>

        {/* Historical window */}
        <section className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold">Historical Data Window</h2>
          </div>
          <div className="flex gap-2">
            {(["1y", "2y", "3y", "5y"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  period === p
                    ? "bg-primary text-primary-foreground"
                    : "border bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Longer windows give more stable estimates but may include outdated conditions.
          </p>
        </section>

        {/* Investment Amount */}
        <section className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold mb-1">Investment Amount <span className="text-muted-foreground font-normal text-sm">(optional)</span></h2>
          <p className="text-xs text-muted-foreground mb-3">Enter your total capital to see exact dollar allocations per stock alongside the percentages.</p>
          <div className="relative max-w-xs">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">$</span>
            <input
              type="text"
              value={investmentAmount}
              onChange={(e) => setInvestmentAmount(e.target.value.replace(/[^0-9.,]/g, ""))}
              placeholder="10,000"
              className="w-full rounded-lg border bg-background pl-7 pr-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </section>

        {error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Button
          size="lg"
          className="w-full"
          onClick={handleOptimize}
          disabled={loading || tickers.length < 2}
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Optimizing…
            </span>
          ) : (
            "Optimize Portfolio"
          )}
        </Button>
      </div>
    </div>
  );
}
