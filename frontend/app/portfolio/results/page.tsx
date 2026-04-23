"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { EfficientFrontierChart } from "@/components/portfolio/EfficientFrontierChart";
import { AllocationPieChart } from "@/components/portfolio/AllocationPieChart";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, ReferenceLine,
} from "recharts";
import type { PortfolioResult, FrontierPoint } from "@/lib/types";
import { formatPercent } from "@/lib/formatters";
import { TrendingUp, ArrowLeft, MousePointerClick, RotateCcw, Info } from "lucide-react";

const PIE_COLORS = [
  "#2563eb", "#16a34a", "#d97706", "#dc2626",
  "#7c3aed", "#0891b2", "#db2777", "#65a30d", "#ea580c", "#6d28d9",
];

export default function PortfolioResultsPage() {
  const router = useRouter();
  const [result, setResult] = useState<PortfolioResult | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<FrontierPoint | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [investmentAmount, setInvestmentAmount] = useState<number>(0);

  useEffect(() => {
    const stored = sessionStorage.getItem("portfolioResult");
    if (!stored) { router.push("/portfolio"); return; }
    setResult(JSON.parse(stored));
    const amt = parseFloat(sessionStorage.getItem("investmentAmount") || "0");
    if (!isNaN(amt) && amt > 0) setInvestmentAmount(amt);
  }, [router]);

  const handleFrontierClick = useCallback((point: FrontierPoint, idx: number) => {
    setSelectedPoint(point);
    setSelectedIndex(idx);
  }, []);

  const resetToOptimal = () => {
    setSelectedPoint(null);
    setSelectedIndex(null);
  };

  if (!result) return null;

  // Active view: either the clicked frontier point or the optimized result
  const activeWeights = selectedPoint?.weights ?? result.weights;
  const activeReturn = selectedPoint?.return ?? result.expected_return;
  const activeVol = selectedPoint?.volatility ?? result.volatility;
  const activeSharpe = selectedPoint?.sharpe ?? result.sharpe_ratio;
  const isCustomPoint = selectedPoint !== null;

  const sortedWeights = Object.entries(activeWeights)
    .filter(([, w]) => w > 0.001)
    .sort(([, a], [, b]) => b - a);

  // Historical chart: convert cumulative ratio → % gain
  const chartData = result.portfolio_history
    .filter((_, i) => i % 2 === 0)
    .map((d) => ({
      date: d.date,
      portfolio: +((d.portfolio - 1) * 100).toFixed(2),
      benchmark: +((d.benchmark - 1) * 100).toFixed(2),
    }));

  const finalPortfolio = chartData.at(-1)?.portfolio ?? 0;
  const finalBenchmark = chartData.at(-1)?.benchmark ?? 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold">Optimized Portfolio</h1>
          </div>
          <p className="text-sm text-muted-foreground">{result.tickers_used.join(" · ")}</p>
        </div>
        <button
          onClick={() => router.push("/portfolio")}
          className="flex items-center gap-1.5 rounded-lg border bg-background px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          New Portfolio
        </button>
      </div>

      {/* Key metrics */}
      <div className={`grid gap-4 ${investmentAmount > 0 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
        <MetricCard
          label="Expected Return"
          value={formatPercent(activeReturn)}
          sub="Annual, based on history"
          color="text-green-600"
          changed={isCustomPoint && activeReturn !== result.expected_return}
        />
        <MetricCard
          label="Volatility"
          value={formatPercent(activeVol)}
          sub="Annual risk (std dev)"
          color="text-orange-500"
          changed={isCustomPoint && activeVol !== result.volatility}
        />
        <MetricCard
          label="Sharpe Ratio"
          value={activeSharpe.toFixed(2)}
          sub="Return per unit of risk"
          color="text-blue-600"
          changed={isCustomPoint && activeSharpe !== result.sharpe_ratio}
        />
        {investmentAmount > 0 && (
          <MetricCard
            label="Total Investment"
            value={`$${investmentAmount.toLocaleString()}`}
            sub="Dollar allocations shown below"
            color="text-primary"
          />
        )}
      </div>

      {/* Allocation + Frontier */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Allocation */}
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">
              {isCustomPoint ? "Custom Allocation" : "Recommended Allocation"}
            </h2>
            {isCustomPoint && (
              <button
                onClick={resetToOptimal}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <RotateCcw className="h-3 w-3" />
                Reset to optimal
              </button>
            )}
          </div>
          <AllocationPieChart weights={activeWeights} />
          {investmentAmount > 0 && (
            <p className="text-xs text-muted-foreground mb-3">
              Total: <strong>${investmentAmount.toLocaleString()}</strong>
            </p>
          )}
          <div className="mt-4 space-y-2">
            {sortedWeights.map(([ticker, weight], i) => (
              <div key={ticker} className="flex items-center gap-3">
                <div
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                />
                <span className="flex-1 text-sm font-medium">{ticker}</span>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min(weight * 100, 100).toFixed(1)}%`,
                        backgroundColor: PIE_COLORS[i % PIE_COLORS.length],
                        opacity: 0.7,
                      }}
                    />
                  </div>
                  <span className="w-12 text-right text-sm tabular-nums text-muted-foreground">
                    {(weight * 100).toFixed(1)}%
                  </span>
                  {investmentAmount > 0 && (
                    <span className="w-20 text-right text-sm tabular-nums font-medium text-foreground">
                      ${(weight * investmentAmount).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Efficient Frontier */}
        <div className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold mb-1">Efficient Frontier</h2>
          <div className="flex items-center gap-1.5 mb-3">
            <MousePointerClick className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <p className="text-xs text-muted-foreground">
              Click any point to explore that allocation — metrics and weights update instantly.
            </p>
          </div>
          <EfficientFrontierChart
            points={result.frontier_points}
            optimalReturn={result.expected_return}
            optimalVolatility={result.volatility}
            sharpeRatio={result.sharpe_ratio}
            selectedIndex={selectedIndex}
            onPointClick={handleFrontierClick}
          />
          {isCustomPoint && (
            <div className="mt-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
              ◆ Custom point selected — return {formatPercent(activeReturn)}, volatility {formatPercent(activeVol)}
            </div>
          )}
        </div>
      </div>

      {/* Why these weights — explanation */}
      <OptimizationExplanation result={result} activeWeights={activeWeights} isCustomPoint={isCustomPoint} />

      {/* Historical performance */}
      {result.portfolio_history.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          {/* Summary row */}
          <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
            <div>
              <h2 className="font-semibold">Historical Performance vs S&P 500</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Based on optimal weights applied to full historical window
              </p>
            </div>
            <div className="flex gap-6">
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Your Portfolio</p>
                <p className={`text-lg font-bold ${finalPortfolio >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {finalPortfolio >= 0 ? "+" : ""}{finalPortfolio.toFixed(1)}%
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">S&P 500</p>
                <p className={`text-lg font-bold ${finalBenchmark >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {finalBenchmark >= 0 ? "+" : ""}{finalBenchmark.toFixed(1)}%
                </p>
              </div>
            </div>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="portGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="benchGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#9ca3af" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#9ca3af" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.07} />
                <ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.2} strokeDasharray="4 2" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  tickFormatter={(d: string) => {
                    const parts = d.split("-");
                    return parts.length >= 2 ? `${parts[0]}-${parts[1]}` : d;
                  }}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`}
                  width={52}
                />
                <Tooltip
                  formatter={(val: unknown) => {
                    const v = val as number;
                    return [`${v >= 0 ? "+" : ""}${v.toFixed(1)}%`];
                  }}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid rgba(0,0,0,0.1)" }}
                />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Area
                  type="monotone"
                  dataKey="portfolio"
                  stroke="#2563eb"
                  strokeWidth={2}
                  fill="url(#portGrad)"
                  dot={false}
                  name="Your Portfolio"
                />
                <Area
                  type="monotone"
                  dataKey="benchmark"
                  stroke="#9ca3af"
                  strokeWidth={1.5}
                  strokeDasharray="4 2"
                  fill="url(#benchGrad)"
                  dot={false}
                  name="S&P 500"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Past performance does not guarantee future results.
          </p>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label, value, sub, color, changed,
}: {
  label: string; value: string; sub: string; color: string; changed?: boolean;
}) {
  return (
    <div className={`rounded-xl border bg-card p-5 transition-all ${changed ? "border-primary/40 bg-primary/5" : ""}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${color}`}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function OptimizationExplanation({
  result,
  activeWeights,
  isCustomPoint,
}: {
  result: PortfolioResult;
  activeWeights: Record<string, number>;
  isCustomPoint: boolean;
}) {
  const sorted = Object.entries(activeWeights)
    .filter(([, w]) => w > 0.001)
    .sort(([, a], [, b]) => b - a);

  const largest = sorted[0];
  const smallest = sorted[sorted.length - 1];
  const excluded = result.tickers_used.filter((t) => !activeWeights[t] || activeWeights[t] <= 0.001);
  const sharpe = isCustomPoint
    ? result.frontier_points.find((p) =>
        Math.abs(p.return - (result.expected_return)) < 0.01
      )?.sharpe ?? result.sharpe_ratio
    : result.sharpe_ratio;

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Info className="h-4 w-4 text-primary shrink-0" />
        <h2 className="font-semibold">
          {isCustomPoint ? "About This Allocation" : "Why These Weights?"}
        </h2>
      </div>

      <div className="space-y-3 text-sm text-muted-foreground">
        {/* Objective */}
        <p>
          The optimizer solved for the{" "}
          <span className="font-medium text-foreground">
            {sharpe > 1.5
              ? "highest Sharpe ratio (best risk-adjusted return)"
              : "minimum volatility portfolio"}
          </span>{" "}
          using{" "}
          <span className="font-medium text-foreground">
            {result.tickers_used.length} stocks
          </span>{" "}
          and{" "}
          <span className="font-medium text-foreground">2+ years</span> of daily price history.
          It found the combination of weights where each extra unit of risk brings the most additional return.
        </p>

        {/* Top holding reason */}
        {largest && (
          <p>
            <span className="font-semibold text-foreground">{largest[0]}</span> received the
            largest allocation ({(largest[1] * 100).toFixed(1)}%) because its historical
            returns added the most to the portfolio&apos;s Sharpe ratio — it either had
            strong returns, low volatility relative to peers, or low correlation with the
            other stocks (which reduces overall portfolio risk).
          </p>
        )}

        {/* Smallest holding */}
        {smallest && smallest[0] !== largest?.[0] && (
          <p>
            <span className="font-semibold text-foreground">{smallest[0]}</span> received the
            smallest allocation ({(smallest[1] * 100).toFixed(1)}%) but is still included
            because it helps diversify the portfolio — even a small position in a stock that
            moves differently from the others lowers total volatility.
          </p>
        )}

        {/* Excluded stocks */}
        {excluded.length > 0 && (
          <p>
            <span className="font-semibold text-foreground">{excluded.join(", ")}</span>{" "}
            {excluded.length === 1 ? "was" : "were"} excluded (0% weight) because{" "}
            {excluded.length === 1 ? "it" : "they"} would have lowered the Sharpe ratio —
            {excluded.length === 1 ? " its" : " their"} return-to-risk profile or high
            correlation with existing holdings made {excluded.length === 1 ? "it" : "them"}
            {" "}redundant in this combination.
          </p>
        )}

        {/* Frontier explanation */}
        <div className="rounded-lg bg-muted/50 px-4 py-3 mt-2 space-y-1.5">
          <p className="font-medium text-foreground text-xs uppercase tracking-wide">
            Understanding the Efficient Frontier
          </p>
          <p>
            Each point on the curve above is a fully-invested portfolio (weights sum to 100%)
            with a different risk/return trade-off. Points further <strong>right</strong> have
            higher volatility; points further <strong>up</strong> have higher expected returns.
            There is no portfolio above the curve — that region is mathematically impossible
            with these stocks. Any portfolio <strong>below</strong> the curve is suboptimal
            (you could get more return for the same risk by moving up to the curve).
          </p>
          <p>
            The <strong>optimal portfolio</strong> (★) is the single point where the
            return-to-risk ratio (Sharpe ratio) is maximised. Click any other point on the
            curve to see the trade-off if you want more or less risk.
          </p>
        </div>
      </div>
    </div>
  );
}
