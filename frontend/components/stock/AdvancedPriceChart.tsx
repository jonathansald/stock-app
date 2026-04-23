"use client";

import {
  useState, useEffect, useRef, useCallback, useMemo,
} from "react";
import {
  createChart, ColorType, CrosshairMode,
  CandlestickSeries, AreaSeries, HistogramSeries, LineSeries,
  type IChartApi, type ISeriesApi, type SeriesType, type Time,
} from "lightweight-charts";
import { useTheme } from "next-themes";
import { getHistory } from "@/lib/api";
import type { HistoricalPrice } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/formatters";
import {
  Settings2, ChevronDown, Plus, X, TrendingUp,
} from "lucide-react";
import {
  calcSMA, calcEMA, calcBollingerBands,
  calcRSI, calcMACD, calcStochastic, calcVWAP, normalizeToPercent,
} from "@/lib/indicators";

// ── Types & constants ────────────────────────────────────────────────────────

const PERIODS = ["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y"] as const;
type Period = (typeof PERIODS)[number];

interface Props {
  ticker: string;
  initialData: HistoricalPrice[];
  initialPeriod?: string;
}

interface IndicatorState {
  bollinger: boolean; vwap: boolean;
  rsi: boolean; macd: boolean; stochastic: boolean;
  volume: boolean;
}

interface CustomMA {
  id: string;
  type: "SMA" | "EMA";
  period: number;
  color: string;
}

interface CompareEntry { ticker: string; color: string; data: HistoricalPrice[] }

const DEFAULT_IND: IndicatorState = {
  bollinger: false, vwap: false,
  rsi: false, macd: false, stochastic: false,
  volume: true,
};

const MA_PRESETS: { type: "SMA" | "EMA"; period: number; color: string }[] = [
  { type: "SMA", period: 20,  color: "#3b82f6" },
  { type: "SMA", period: 50,  color: "#f97316" },
  { type: "SMA", period: 200, color: "#ef4444" },
  { type: "EMA", period: 9,   color: "#a855f7" },
  { type: "EMA", period: 20,  color: "#14b8a6" },
];

const MA_PALETTE = [
  "#3b82f6", "#f97316", "#ef4444", "#a855f7", "#14b8a6",
  "#f59e0b", "#10b981", "#ec4899", "#06b6d4", "#84cc16",
];

const COMPARE_COLORS = ["#8b5cf6", "#f59e0b", "#10b981", "#ef4444", "#06b6d4", "#f43f5e"];

// ── Theme helper ─────────────────────────────────────────────────────────────

function themeColors(dark: boolean) {
  return {
    bg: dark ? "#09090b" : "#ffffff",
    text: dark ? "#a1a1aa" : "#71717a",
    grid: dark ? "#27272a" : "#f4f4f5",
    border: dark ? "#27272a" : "#e4e4e7",
    up: "#16a34a", down: "#dc2626",
    upFill: "rgba(22,163,74,0.12)",
    downFill: "rgba(220,38,38,0.12)",
    volUp: "rgba(22,163,74,0.4)", volDown: "rgba(220,38,38,0.4)",
  };
}

function toTime(d: HistoricalPrice): Time {
  return d.date as Time;
}

// ── Main component ────────────────────────────────────────────────────────────

export function AdvancedPriceChart({ ticker, initialData, initialPeriod = "1y" }: Props) {
  const [period, setPeriod] = useState<Period>(initialPeriod as Period);
  const [data, setData] = useState<HistoricalPrice[]>(initialData);
  const [chartType, setChartType] = useState<"candle" | "area">("candle");
  const [loading, setLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [indicators, setIndicators] = useState<IndicatorState>(DEFAULT_IND);

  // Custom MA state
  const [customMAs, setCustomMAs] = useState<CustomMA[]>([]);
  const [maType, setMaType] = useState<"SMA" | "EMA">("SMA");
  const [maPeriod, setMaPeriod] = useState<number>(20);
  const [maColor, setMaColor] = useState<string>(MA_PALETTE[0]);

  // Compare state
  const [compareEntries, setCompareEntries] = useState<CompareEntry[]>([]);
  const [compareInput, setCompareInput] = useState("");
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState("");
  const [isCompareMode, setIsCompareMode] = useState(false);

  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  // Chart DOM refs
  const mainRef = useRef<HTMLDivElement>(null);
  const rsiRef = useRef<HTMLDivElement>(null);
  const macdRef = useRef<HTMLDivElement>(null);
  const stochRef = useRef<HTMLDivElement>(null);

  // Chart instance refs
  const mainChart = useRef<IChartApi | null>(null);
  const rsiChart = useRef<IChartApi | null>(null);
  const macdChart = useRef<IChartApi | null>(null);
  const stochChart = useRef<IChartApi | null>(null);

  // Period summary
  const first = data[0]?.close ?? 0;
  const last = data[data.length - 1]?.close ?? 0;
  const periodChange = last - first;
  const periodPct = first > 0 ? (periodChange / first) * 100 : 0;
  const isUp = periodChange >= 0;

  // ── MA helpers ─────────────────────────────────────────────────────────────

  const togglePresetMA = (preset: typeof MA_PRESETS[number]) => {
    const id = `${preset.type}-${preset.period}`;
    if (customMAs.some((m) => m.id === id)) {
      setCustomMAs((prev) => prev.filter((m) => m.id !== id));
    } else {
      setCustomMAs((prev) => [...prev, { ...preset, id }]);
    }
  };

  const addCustomMA = () => {
    if (!maPeriod || maPeriod < 2 || maPeriod > 500) return;
    if (customMAs.some((m) => m.type === maType && m.period === maPeriod)) return;
    const id = `${maType}-${maPeriod}-${Date.now()}`;
    setCustomMAs((prev) => [...prev, { id, type: maType, period: maPeriod, color: maColor }]);
    // Advance color for next add
    const nextColorIdx = (MA_PALETTE.indexOf(maColor) + 1) % MA_PALETTE.length;
    setMaColor(MA_PALETTE[nextColorIdx]);
  };

  const removeMA = (id: string) => setCustomMAs((prev) => prev.filter((m) => m.id !== id));

  // ── Build / rebuild charts ─────────────────────────────────────────────────

  const buildCharts = useCallback(() => {
    [mainChart, rsiChart, macdChart, stochChart].forEach((ref) => {
      ref.current?.remove(); ref.current = null;
    });

    if (!mainRef.current || data.length === 0) return;

    const c = themeColors(isDark);
    const baseOpts = {
      layout: {
        background: { type: ColorType.Solid, color: c.bg },
        textColor: c.text, fontFamily: "inherit", fontSize: 11,
      },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      crosshair: { mode: CrosshairMode.Normal },
      handleScroll: true, handleScale: true,
    };

    const chart = createChart(mainRef.current, {
      ...baseOpts,
      rightPriceScale: {
        borderColor: c.border,
        scaleMargins: { top: 0.06, bottom: indicators.volume ? 0.22 : 0.04 },
      },
      timeScale: { borderColor: c.border, timeVisible: true, secondsVisible: false },
    });
    mainChart.current = chart;

    const closes = data.map((d) => d.close);
    const highs  = data.map((d) => d.high);
    const lows   = data.map((d) => d.low);
    const times  = data.map(toTime);

    if (isCompareMode && compareEntries.length > 0) {
      const normMain = normalizeToPercent(closes);
      const mainSeries = chart.addSeries(AreaSeries, {
        lineColor: "#2563eb", topColor: "rgba(37,99,235,0.15)",
        bottomColor: "transparent", lineWidth: 2, priceLineVisible: false,
        title: ticker,
      });
      mainSeries.setData(normMain.map((v, i) => ({ time: times[i], value: v })));

      compareEntries.forEach((entry) => {
        const cCloses = entry.data.map((d) => d.close);
        const norm = normalizeToPercent(cCloses);
        const cTimes = entry.data.map(toTime);
        const cSeries = chart.addSeries(LineSeries, { color: entry.color, lineWidth: 2, title: entry.ticker });
        cSeries.setData(norm.map((v, i) => ({ time: cTimes[i], value: v })));
      });
    } else {
      let mainSeries: ISeriesApi<SeriesType>;

      if (chartType === "candle") {
        mainSeries = chart.addSeries(CandlestickSeries, {
          upColor: c.up, downColor: c.down,
          borderUpColor: c.up, borderDownColor: c.down,
          wickUpColor: c.up, wickDownColor: c.down,
        });
        mainSeries.setData(data.map((d) => ({
          time: toTime(d), open: d.open, high: d.high, low: d.low, close: d.close,
        })));
      } else {
        mainSeries = chart.addSeries(AreaSeries, {
          lineColor: isUp ? c.up : c.down,
          topColor: isUp ? c.upFill : c.downFill,
          bottomColor: "transparent", lineWidth: 2, priceLineVisible: false,
        });
        mainSeries.setData(data.map((d) => ({ time: toTime(d), value: d.close })));
      }

      const addLine = (vals: (number | null)[], color: string, title: string, width = 1) => {
        const s = chart.addSeries(LineSeries, { color, lineWidth: width as 1 | 2 | 3 | 4, title, priceLineVisible: false, lastValueVisible: false });
        s.setData(
          vals
            .map((v, i) => v !== null ? { time: times[i], value: v } : null)
            .filter(Boolean) as { time: Time; value: number }[],
        );
      };

      // Custom MAs
      customMAs.forEach((ma) => {
        const vals = ma.type === "SMA" ? calcSMA(closes, ma.period) : calcEMA(closes, ma.period);
        addLine(vals, ma.color, `${ma.type} ${ma.period}`);
      });

      if (indicators.vwap)   addLine(calcVWAP(data), "#eab308", "VWAP");

      if (indicators.bollinger) {
        const bb = calcBollingerBands(closes);
        addLine(bb.upper,  "rgba(156,163,175,0.9)", "BB Upper");
        addLine(bb.middle, "rgba(156,163,175,0.6)", "BB Mid");
        addLine(bb.lower,  "rgba(156,163,175,0.9)", "BB Lower");
      }

      if (indicators.volume) {
        const volSeries = chart.addSeries(HistogramSeries, {
          priceFormat: { type: "volume" }, priceScaleId: "volume",
        });
        chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
        volSeries.setData(data.map((d) => ({
          time: toTime(d), value: d.volume,
          color: d.close >= d.open ? c.volUp : c.volDown,
        })));
      }
    }

    chart.timeScale().fitContent();

    if (indicators.rsi && rsiRef.current) {
      const rc = createChart(rsiRef.current, {
        ...baseOpts,
        rightPriceScale: { borderColor: c.border, scaleMargins: { top: 0.1, bottom: 0.1 } },
        timeScale: { borderColor: c.border, timeVisible: true, secondsVisible: false, visible: false },
        height: 120,
      });
      rsiChart.current = rc;

      const rsiVals = calcRSI(closes);
      const rsiSeries = rc.addSeries(LineSeries, { color: "#8b5cf6", lineWidth: 1, priceLineVisible: false });
      rsiSeries.setData(
        rsiVals.map((v, i) => v !== null ? { time: times[i], value: v } : null).filter(Boolean) as { time: Time; value: number }[],
      );
      [{ v: 70, c: "rgba(239,68,68,0.5)" }, { v: 30, c: "rgba(22,163,74,0.5)" }].forEach(({ v, c: col }) => {
        const s = rc.addSeries(LineSeries, { color: col, lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });
        s.setData(times.map((t) => ({ time: t, value: v })));
      });
      chart.timeScale().subscribeVisibleTimeRangeChange((range) => {
        if (range) rc.timeScale().setVisibleRange(range);
      });
    }

    if (indicators.macd && macdRef.current) {
      const mc = createChart(macdRef.current, {
        ...baseOpts,
        rightPriceScale: { borderColor: c.border, scaleMargins: { top: 0.1, bottom: 0.1 } },
        timeScale: { borderColor: c.border, timeVisible: true, secondsVisible: false, visible: false },
        height: 120,
      });
      macdChart.current = mc;

      const { macd, signal, histogram } = calcMACD(closes);
      const histSeries = mc.addSeries(HistogramSeries, { priceScaleId: "right" });
      histSeries.setData(
        histogram.map((v, i) => v !== null ? { time: times[i], value: v, color: v >= 0 ? "rgba(22,163,74,0.7)" : "rgba(220,38,38,0.7)" } : null)
          .filter(Boolean) as { time: Time; value: number; color: string }[],
      );
      const macdSeries = mc.addSeries(LineSeries, { color: "#3b82f6", lineWidth: 1, priceLineVisible: false });
      macdSeries.setData(macd.map((v, i) => v !== null ? { time: times[i], value: v } : null).filter(Boolean) as { time: Time; value: number }[]);
      const sigSeries = mc.addSeries(LineSeries, { color: "#f97316", lineWidth: 1, priceLineVisible: false });
      sigSeries.setData(signal.map((v, i) => v !== null ? { time: times[i], value: v } : null).filter(Boolean) as { time: Time; value: number }[]);
      chart.timeScale().subscribeVisibleTimeRangeChange((range) => {
        if (range) mc.timeScale().setVisibleRange(range);
      });
    }

    if (indicators.stochastic && stochRef.current) {
      const sc = createChart(stochRef.current, {
        ...baseOpts,
        rightPriceScale: { borderColor: c.border, scaleMargins: { top: 0.1, bottom: 0.1 } },
        timeScale: { borderColor: c.border, timeVisible: true, secondsVisible: false, visible: false },
        height: 120,
      });
      stochChart.current = sc;

      const { k, d } = calcStochastic(highs, lows, closes);
      const kSeries = sc.addSeries(LineSeries, { color: "#3b82f6", lineWidth: 1, priceLineVisible: false });
      kSeries.setData(k.map((v, i) => v !== null ? { time: times[i], value: v } : null).filter(Boolean) as { time: Time; value: number }[]);
      const dSeries = sc.addSeries(LineSeries, { color: "#f97316", lineWidth: 1, lineStyle: 2, priceLineVisible: false });
      dSeries.setData(d.map((v, i) => v !== null ? { time: times[i], value: v } : null).filter(Boolean) as { time: Time; value: number }[]);
      [{ v: 80, c: "rgba(239,68,68,0.4)" }, { v: 20, c: "rgba(22,163,74,0.4)" }].forEach(({ v, c: col }) => {
        const ls = sc.addSeries(LineSeries, { color: col, lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });
        ls.setData(times.map((t) => ({ time: t, value: v })));
      });
      chart.timeScale().subscribeVisibleTimeRangeChange((range) => {
        if (range) sc.timeScale().setVisibleRange(range);
      });
    }

    const ro = new ResizeObserver(() => {
      if (mainRef.current && mainChart.current) {
        mainChart.current.applyOptions({ width: mainRef.current.clientWidth });
      }
    });
    if (mainRef.current) ro.observe(mainRef.current);
    return () => ro.disconnect();
  }, [data, chartType, isDark, indicators, customMAs, compareEntries, isCompareMode, ticker, isUp]);

  useEffect(() => {
    const cleanup = buildCharts();
    return () => {
      cleanup?.();
      [mainChart, rsiChart, macdChart, stochChart].forEach((ref) => {
        ref.current?.remove(); ref.current = null;
      });
    };
  }, [buildCharts]);

  // ── Period change ───────────────────────────────────────────────────────────

  const handlePeriodChange = async (p: Period) => {
    if (p === period) return;
    setPeriod(p);
    setLoading(true);
    try {
      const [mainRes, ...compRes] = await Promise.all([
        getHistory(ticker, p),
        ...compareEntries.map((e) => getHistory(e.ticker, p)),
      ]);
      setData(mainRes.data);
      setCompareEntries((prev) =>
        prev.map((e, i) => ({ ...e, data: compRes[i]?.data ?? e.data })),
      );
    } finally {
      setLoading(false);
    }
  };

  // ── Compare ─────────────────────────────────────────────────────────────────

  const addCompare = async () => {
    const sym = compareInput.trim().toUpperCase();
    if (!sym || compareEntries.some((e) => e.ticker === sym) || compareEntries.length >= 5) return;
    setCompareLoading(true);
    setCompareError("");
    try {
      const res = await getHistory(sym, period);
      if (!res.data.length) throw new Error("No data");
      const color = COMPARE_COLORS[compareEntries.length % COMPARE_COLORS.length];
      setCompareEntries((prev) => [...prev, { ticker: sym, color, data: res.data }]);
      setIsCompareMode(true);
      setCompareInput("");
    } catch {
      setCompareError(`No data for ${sym}`);
    } finally {
      setCompareLoading(false);
    }
  };

  const removeCompare = (sym: string) => {
    const next = compareEntries.filter((e) => e.ticker !== sym);
    setCompareEntries(next);
    if (next.length === 0) setIsCompareMode(false);
  };

  const toggle = (key: keyof IndicatorState) =>
    setIndicators((prev) => ({ ...prev, [key]: !prev[key] }));

  const compareLegend = useMemo(() => {
    if (!isCompareMode) return null;
    const mainNorm = data.length ? normalizeToPercent(data.map((d) => d.close)) : [];
    const mainLast = mainNorm[mainNorm.length - 1] ?? 0;
    return (
      <div className="flex flex-wrap gap-3 mt-1 text-xs">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-600" />
          <span className="font-medium">{ticker}</span>
          <span className={mainLast >= 0 ? "text-green-500" : "text-red-500"}>
            {mainLast >= 0 ? "+" : ""}{mainLast.toFixed(1)}%
          </span>
        </span>
        {compareEntries.map((e) => {
          const norm = normalizeToPercent(e.data.map((d) => d.close));
          const last = norm[norm.length - 1] ?? 0;
          return (
            <span key={e.ticker} className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: e.color }} />
              <span className="font-medium">{e.ticker}</span>
              <span className={last >= 0 ? "text-green-500" : "text-red-500"}>
                {last >= 0 ? "+" : ""}{last.toFixed(1)}%
              </span>
              <button onClick={() => removeCompare(e.ticker)} className="text-muted-foreground hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}
      </div>
    );
  }, [isCompareMode, ticker, data, compareEntries]);

  const activeCount =
    Object.values(indicators).filter(Boolean).length
    - (indicators.volume ? 1 : 0)
    + customMAs.length
    + compareEntries.length;

  const subPaneCount = [indicators.rsi, indicators.macd, indicators.stochastic].filter(Boolean).length;
  const mainHeight = subPaneCount === 0 ? 320 : subPaneCount === 1 ? 260 : 220;

  return (
    <div className="rounded-lg border bg-card p-5">
      {/* ── Top toolbar ── */}
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-baseline gap-3">
            <h2 className="font-semibold">Price History</h2>
            {!isCompareMode && data.length > 0 && (
              <span className={`text-sm font-medium ${isUp ? "text-green-600" : "text-red-600"}`}>
                {isUp ? "+" : ""}{periodPct.toFixed(2)}%&nbsp;
                ({isUp ? "+" : ""}{formatCurrency(periodChange)})
              </span>
            )}
            {isCompareMode && (
              <span className="text-xs text-muted-foreground">Normalized % change</span>
            )}
          </div>
          {compareLegend}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isCompareMode && (
            <div className="flex overflow-hidden rounded-md border">
              {(["candle", "area"] as const).map((t) => (
                <button key={t}
                  onClick={() => setChartType(t)}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors capitalize ${chartType === t ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-0.5">
            {PERIODS.map((p) => (
              <Button key={p} variant={period === p ? "default" : "ghost"} size="sm"
                className="h-7 px-2 text-xs" onClick={() => handlePeriodChange(p)} disabled={loading}>
                {p}
              </Button>
            ))}
          </div>

          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className={`flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${showAdvanced ? "bg-primary/10 border-primary/30 text-primary" : "bg-background text-muted-foreground hover:bg-muted"}`}
          >
            <Settings2 className="h-3.5 w-3.5" />
            Advanced
            {activeCount > 0 && (
              <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {activeCount}
              </span>
            )}
            <ChevronDown className={`h-3 w-3 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {/* ── Advanced panel ── */}
      {showAdvanced && (
        <div className="mb-4 rounded-xl border bg-muted/20 p-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">

            {/* ── Moving Averages ── */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Moving Averages</p>

              {/* Quick preset pills */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {MA_PRESETS.map((preset) => {
                  const isActive = customMAs.some((m) => m.id === `${preset.type}-${preset.period}`);
                  return (
                    <button
                      key={`${preset.type}-${preset.period}`}
                      onClick={() => togglePresetMA(preset)}
                      className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-all hover:scale-105"
                      style={isActive
                        ? { background: preset.color, borderColor: preset.color, color: "#fff" }
                        : { borderColor: preset.color + "60", color: preset.color }}
                    >
                      {isActive && <span className="h-1.5 w-1.5 rounded-full bg-white/80" />}
                      {preset.type} {preset.period}
                    </button>
                  );
                })}
              </div>

              {/* Custom MA builder */}
              <div className="rounded-lg border bg-background p-2.5 space-y-2">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Custom</p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <select
                    value={maType}
                    onChange={(e) => setMaType(e.target.value as "SMA" | "EMA")}
                    className="rounded border bg-background px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option>SMA</option>
                    <option>EMA</option>
                  </select>
                  <input
                    type="number"
                    value={maPeriod}
                    onChange={(e) => setMaPeriod(Math.max(2, Math.min(500, Number(e.target.value))))}
                    min={2} max={500}
                    className="w-14 rounded border bg-background px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    onKeyDown={(e) => e.key === "Enter" && addCustomMA()}
                  />
                  <button
                    onClick={addCustomMA}
                    className="rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    Add
                  </button>
                </div>
                {/* Color palette */}
                <div className="flex gap-1 flex-wrap">
                  {MA_PALETTE.map((color) => (
                    <button
                      key={color}
                      onClick={() => setMaColor(color)}
                      title={color}
                      className="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110"
                      style={{ background: color, borderColor: maColor === color ? "#000" : "transparent",
                        outline: maColor === color ? `2px solid ${color}` : "none", outlineOffset: "1px" }}
                    />
                  ))}
                </div>
              </div>

              {/* Active MAs */}
              {customMAs.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {customMAs.map((ma) => (
                    <div
                      key={ma.id}
                      className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-white"
                      style={{ background: ma.color }}
                    >
                      {ma.type} {ma.period}
                      <button onClick={() => removeMA(ma.id)} className="hover:opacity-70 transition-opacity">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Other overlays */}
              <p className="mt-3 mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Overlays</p>
              <div className="space-y-1.5">
                {([
                  ["bollinger", "Bollinger Bands", "bg-gray-400"],
                  ["vwap",      "VWAP",            "bg-yellow-400"],
                  ["volume",    "Volume",           "bg-green-400"],
                ] as [keyof IndicatorState, string, string][]).map(([key, label, colorClass]) => (
                  <label key={key} className="flex cursor-pointer items-center gap-2 text-sm select-none">
                    <input type="checkbox" checked={indicators[key]} onChange={() => toggle(key)} className="h-3.5 w-3.5 rounded" />
                    <span className={`h-2 w-4 rounded ${colorClass}`} />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {/* ── Sub-pane indicators ── */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sub-Pane Indicators</p>
              <div className="space-y-1.5">
                <label className="flex cursor-pointer items-center gap-2 text-sm select-none">
                  <input type="checkbox" checked={indicators.rsi} onChange={() => toggle("rsi")} className="h-3.5 w-3.5 rounded" />
                  RSI (14)
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm select-none">
                  <input type="checkbox" checked={indicators.macd} onChange={() => toggle("macd")} className="h-3.5 w-3.5 rounded" />
                  MACD (12,26,9)
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm select-none">
                  <input type="checkbox" checked={indicators.stochastic} onChange={() => toggle("stochastic")} className="h-3.5 w-3.5 rounded" />
                  Stochastic (14,3)
                </label>
              </div>
              <div className="mt-3 rounded-lg bg-muted/40 p-2.5 text-xs text-muted-foreground space-y-1">
                <p><span className="font-medium text-foreground">RSI:</span> &gt;70 overbought, &lt;30 oversold</p>
                <p><span className="font-medium text-foreground">MACD:</span> blue=MACD, orange=signal, bars=histogram</p>
                <p><span className="font-medium text-foreground">Stoch:</span> blue=%K, orange=%D; &gt;80/&lt;20 levels</p>
              </div>
            </div>

            {/* ── Compare ── */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Compare</p>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={compareInput}
                  onChange={(e) => { setCompareInput(e.target.value.toUpperCase()); setCompareError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && addCompare()}
                  placeholder="e.g. SPY, QQQ"
                  className="flex-1 rounded-md border bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  onClick={addCompare}
                  disabled={compareLoading || !compareInput.trim()}
                  className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50 hover:bg-primary/90"
                >
                  {compareLoading ? "…" : <Plus className="h-3.5 w-3.5" />}
                </button>
              </div>
              {compareError && <p className="mt-1 text-xs text-destructive">{compareError}</p>}
              <div className="mt-2 space-y-1">
                {compareEntries.map((e) => (
                  <div key={e.ticker} className="flex items-center justify-between rounded-md bg-muted/50 px-2 py-1">
                    <span className="flex items-center gap-1.5 text-xs font-medium">
                      <span className="h-2 w-2 rounded-full" style={{ background: e.color }} />
                      {e.ticker}
                    </span>
                    <button onClick={() => removeCompare(e.ticker)} className="text-muted-foreground hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
              {compareEntries.length === 0 && (
                <div className="mt-2 text-xs text-muted-foreground">
                  <p>Add tickers to compare as % return.</p>
                  <p className="mt-1 opacity-70">Try: SPY, ^GSPC, QQQ, BTC-USD</p>
                </div>
              )}
              {compareEntries.length > 0 && (
                <button onClick={() => { setCompareEntries([]); setIsCompareMode(false); }}
                  className="mt-2 text-xs text-muted-foreground hover:text-foreground underline">
                  Clear all
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Chart area ── */}
      <div className="relative">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-background/60 backdrop-blur-sm">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}

        <div ref={mainRef} style={{ height: mainHeight }} className="w-full" />

        {indicators.rsi && (
          <div className="mt-1">
            <div className="flex items-center gap-2 px-1 py-0.5">
              <span className="text-[10px] font-semibold uppercase text-muted-foreground">RSI (14)</span>
              <span className="text-[10px] text-muted-foreground">— purple • OB/OS: 70/30</span>
            </div>
            <div ref={rsiRef} className="w-full" style={{ height: 120 }} />
          </div>
        )}
        {indicators.macd && (
          <div className="mt-1">
            <div className="flex items-center gap-2 px-1 py-0.5">
              <span className="text-[10px] font-semibold uppercase text-muted-foreground">MACD (12,26,9)</span>
              <span className="text-[10px] text-muted-foreground">blue=MACD  orange=Signal  bars=Histogram</span>
            </div>
            <div ref={macdRef} className="w-full" style={{ height: 120 }} />
          </div>
        )}
        {indicators.stochastic && (
          <div className="mt-1">
            <div className="flex items-center gap-2 px-1 py-0.5">
              <span className="text-[10px] font-semibold uppercase text-muted-foreground">Stochastic (14,3)</span>
              <span className="text-[10px] text-muted-foreground">blue=%K  orange=%D  levels: 80/20</span>
            </div>
            <div ref={stochRef} className="w-full" style={{ height: 120 }} />
          </div>
        )}
      </div>
    </div>
  );
}
