"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  createChart, ColorType, CrosshairMode,
  AreaSeries, HistogramSeries, LineSeries,
  type IChartApi, type Time,
} from "lightweight-charts";
import { useTheme } from "next-themes";
import { X, TrendingUp, TrendingDown, Plus } from "lucide-react";
import { getMarketSymbolHistory } from "@/lib/api";
import type { HistoricalPrice } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { calcSMA, calcEMA, calcRSI, calcMACD } from "@/lib/indicators";

// ── Types ────────────────────────────────────────────────────────────────────

export interface MarketInstrumentInfo {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  change_pct: number | null;
  is_rate?: boolean;
  category: string;
}

interface Props {
  instrument: MarketInstrumentInfo | null;
  onClose: () => void;
}

const PERIODS = [
  { label: "1D",  value: "1d"  },
  { label: "1W",  value: "5d"  },
  { label: "1M",  value: "1mo" },
  { label: "3M",  value: "3mo" },
  { label: "6M",  value: "6mo" },
  { label: "1Y",  value: "1y"  },
  { label: "2Y",  value: "2y"  },
  { label: "5Y",  value: "5y"  },
] as const;

type PeriodValue = (typeof PERIODS)[number]["value"];

interface CustomMA {
  id: string;
  type: "SMA" | "EMA";
  period: number;
  color: string;
}

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

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  indexes:     "Tracks the performance of a basket of stocks, reflecting overall market sentiment.",
  commodities: "Physical goods traded on exchanges. Prices driven by supply, demand, and macro events.",
  rates:       "US Treasury yield. Rising yields signal tighter monetary policy and can pressure equities.",
  crypto:      "Decentralised digital asset trading 24/7 with high volatility.",
  forex:       "Foreign exchange pair — reflects relative economic strength between two currencies.",
};

function themeColors(dark: boolean) {
  return {
    bg:      dark ? "#09090b" : "#ffffff",
    text:    dark ? "#a1a1aa" : "#71717a",
    grid:    dark ? "#27272a" : "#f4f4f5",
    border:  dark ? "#27272a" : "#e4e4e7",
    up:      "#16a34a", down: "#dc2626",
    upFill:  "rgba(22,163,74,0.15)",
    downFill:"rgba(220,38,38,0.15)",
    volUp:   "rgba(22,163,74,0.45)",
    volDown: "rgba(220,38,38,0.45)",
  };
}

function toTime(d: HistoricalPrice): Time { return d.date as Time; }

function fmtPrice(price: number | null, isRate?: boolean): string {
  if (price == null) return "—";
  if (isRate) return `${price.toFixed(3)}%`;
  if (price >= 10000) return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return price.toFixed(price < 1 ? 4 : 2);
}

function pctLabel(v: number | null) {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

// ── Component ────────────────────────────────────────────────────────────────

export function MarketInstrumentModal({ instrument, onClose }: Props) {
  const [period, setPeriod] = useState<PeriodValue>("1y");
  const [data, setData] = useState<HistoricalPrice[]>([]);
  const [loading, setLoading] = useState(false);
  const [showRSI, setShowRSI] = useState(false);
  const [showMACD, setShowMACD] = useState(false);
  const [customMAs, setCustomMAs] = useState<CustomMA[]>([]);
  const [maType, setMaType] = useState<"SMA" | "EMA">("SMA");
  const [maPeriod, setMaPeriod] = useState<number>(20);
  const [maColor, setMaColor] = useState<string>(MA_PALETTE[0]);
  const [showMABuilder, setShowMABuilder] = useState(false);

  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const mainRef = useRef<HTMLDivElement>(null);
  const rsiRef  = useRef<HTMLDivElement>(null);
  const macdRef = useRef<HTMLDivElement>(null);
  const mainChart = useRef<IChartApi | null>(null);
  const rsiChart  = useRef<IChartApi | null>(null);
  const macdChart = useRef<IChartApi | null>(null);

  const dayChange = instrument?.change_pct ?? null;
  const isUp = (dayChange ?? 0) >= 0;

  // Fetch data
  useEffect(() => {
    if (!instrument) return;
    setLoading(true);
    setData([]);
    getMarketSymbolHistory(instrument.symbol, period)
      .then((res) => setData(res.data))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [instrument?.symbol, period]);

  // Build chart
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
    const nextIdx = (MA_PALETTE.indexOf(maColor) + 1) % MA_PALETTE.length;
    setMaColor(MA_PALETTE[nextIdx]);
  };

  const removeMA = (id: string) => setCustomMAs((prev) => prev.filter((m) => m.id !== id));

  const buildChart = useCallback(() => {
    [mainChart, rsiChart, macdChart].forEach((r) => { r.current?.remove(); r.current = null; });
    if (!mainRef.current || data.length === 0 || !instrument) return;

    const c = themeColors(isDark);
    const subPanes = [showRSI, showMACD].filter(Boolean).length;
    const mainH = subPanes === 0 ? 420 : subPanes === 1 ? 320 : 260;

    const baseOpts = {
      layout: { background: { type: ColorType.Solid, color: c.bg }, textColor: c.text, fontFamily: "inherit", fontSize: 11 },
      grid:   { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      crosshair: { mode: CrosshairMode.Normal },
      handleScroll: true, handleScale: true,
    };

    const chart = createChart(mainRef.current, {
      ...baseOpts,
      rightPriceScale: { borderColor: c.border, scaleMargins: { top: 0.06, bottom: 0.08 } },
      timeScale: { borderColor: c.border, timeVisible: true, secondsVisible: false },
      height: mainH,
    });
    mainChart.current = chart;

    const closes = data.map((d) => d.close);
    const times  = data.map(toTime);
    const first  = closes[0] ?? 0;
    const last   = closes[closes.length - 1] ?? 0;
    const trendUp = last >= first;

    // Area series
    const mainSeries = chart.addSeries(AreaSeries, {
      lineColor:   trendUp ? c.up : c.down,
      topColor:    trendUp ? c.upFill : c.downFill,
      bottomColor: "transparent",
      lineWidth: 2,
      priceLineVisible: true,
    });
    mainSeries.setData(data.map((d) => ({ time: toTime(d), value: d.close })));

    // Overlay MAs
    const addLine = (vals: (number | null)[], color: string) => {
      const s = chart.addSeries(LineSeries, { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      s.setData(vals.map((v, i) => v !== null ? { time: times[i], value: v } : null).filter(Boolean) as { time: Time; value: number }[]);
    };
    customMAs.forEach((ma) => {
      const vals = ma.type === "SMA" ? calcSMA(closes, ma.period) : calcEMA(closes, ma.period);
      addLine(vals, ma.color);
    });

    // Volume
    const hasVol = data.some((d) => d.volume > 0);
    if (hasVol) {
      const volS = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "vol" });
      chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.86, bottom: 0 } });
      volS.setData(data.map((d) => ({
        time: toTime(d), value: d.volume,
        color: d.close >= d.open ? c.volUp : c.volDown,
      })));
    }

    chart.timeScale().fitContent();

    // RSI sub-chart
    if (showRSI && rsiRef.current) {
      const rc = createChart(rsiRef.current, {
        ...baseOpts,
        rightPriceScale: { borderColor: c.border, scaleMargins: { top: 0.1, bottom: 0.1 } },
        timeScale: { borderColor: c.border, visible: false },
        height: 130,
      });
      rsiChart.current = rc;
      const rsi = calcRSI(closes);
      const rs = rc.addSeries(LineSeries, { color: "#8b5cf6", lineWidth: 1, priceLineVisible: false });
      rs.setData(rsi.map((v, i) => v !== null ? { time: times[i], value: v } : null).filter(Boolean) as { time: Time; value: number }[]);
      [70, 30].forEach((lv, i) => {
        const ls = rc.addSeries(LineSeries, { color: i === 0 ? "rgba(239,68,68,0.6)" : "rgba(22,163,74,0.6)", lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });
        ls.setData(times.map((t) => ({ time: t, value: lv })));
      });
      chart.timeScale().subscribeVisibleTimeRangeChange((r) => { if (r) rc.timeScale().setVisibleRange(r); });
    }

    // MACD sub-chart
    if (showMACD && macdRef.current) {
      const mc = createChart(macdRef.current, {
        ...baseOpts,
        rightPriceScale: { borderColor: c.border, scaleMargins: { top: 0.1, bottom: 0.1 } },
        timeScale: { borderColor: c.border, visible: false },
        height: 130,
      });
      macdChart.current = mc;
      const { macd, signal, histogram } = calcMACD(closes);
      const histS = mc.addSeries(HistogramSeries, { priceScaleId: "right" });
      histS.setData(histogram.map((v, i) => v !== null ? { time: times[i], value: v, color: v >= 0 ? "rgba(22,163,74,0.7)" : "rgba(220,38,38,0.7)" } : null).filter(Boolean) as { time: Time; value: number; color: string }[]);
      const macdS = mc.addSeries(LineSeries, { color: "#3b82f6", lineWidth: 1, priceLineVisible: false });
      macdS.setData(macd.map((v, i) => v !== null ? { time: times[i], value: v } : null).filter(Boolean) as { time: Time; value: number }[]);
      const sigS = mc.addSeries(LineSeries, { color: "#f97316", lineWidth: 1, priceLineVisible: false });
      sigS.setData(signal.map((v, i) => v !== null ? { time: times[i], value: v } : null).filter(Boolean) as { time: Time; value: number }[]);
      chart.timeScale().subscribeVisibleTimeRangeChange((r) => { if (r) mc.timeScale().setVisibleRange(r); });
    }

    const ro = new ResizeObserver(() => { if (mainRef.current && mainChart.current) mainChart.current.applyOptions({ width: mainRef.current.clientWidth }); });
    if (mainRef.current) ro.observe(mainRef.current);
    return () => ro.disconnect();
  }, [data, isDark, customMAs, showRSI, showMACD, instrument]);

  useEffect(() => {
    const cleanup = buildChart();
    return () => { cleanup?.(); [mainChart, rsiChart, macdChart].forEach((r) => { r.current?.remove(); r.current = null; }); };
  }, [buildChart]);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [onClose]);

  if (!instrument) return null;

  // Period stats
  const periodFirst = data[0]?.close;
  const periodLast  = data[data.length - 1]?.close;
  const periodPct   = periodFirst && periodLast ? ((periodLast - periodFirst) / periodFirst) * 100 : null;
  const periodChange = periodFirst && periodLast ? periodLast - periodFirst : null;
  const high52 = data.length ? Math.max(...data.map((d) => d.high)) : null;
  const low52  = data.length ? Math.min(...data.map((d) => d.low)) : null;
  const avg    = data.length ? data.map((d) => d.close).reduce((a, b) => a + b, 0) / data.length : null;

  // Approximate 1-week change from data if we're in longer-period view
  const weekData = data.slice(-5);
  const weekPct = weekData.length >= 2
    ? ((weekData[weekData.length - 1].close - weekData[0].close) / weekData[0].close) * 100
    : null;

  const currentPeriodLabel = PERIODS.find((p) => p.value === period)?.label ?? period;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col w-full max-w-5xl max-h-[94vh] overflow-y-auto rounded-2xl border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-start justify-between border-b p-5 pb-4 shrink-0">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold">{instrument.name}</h2>
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-mono text-muted-foreground">{instrument.symbol}</span>
              <span className="rounded-full border px-2 py-0.5 text-xs capitalize text-muted-foreground">{instrument.category}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground max-w-xl">
              {CATEGORY_DESCRIPTIONS[instrument.category] ?? ""}
            </p>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Price + stats row ── */}
        <div className="flex flex-wrap items-center gap-4 px-5 pt-4 pb-3 border-b shrink-0">
          {/* Current price */}
          <div>
            <p className="text-3xl font-bold tabular-nums">{fmtPrice(instrument.price, instrument.is_rate)}</p>
            <div className={`flex items-center gap-1 mt-0.5 text-sm font-medium ${isUp ? "text-green-500" : "text-red-500"}`}>
              {isUp ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              <span>{instrument.change !== null ? `${instrument.change >= 0 ? "+" : ""}${instrument.change.toFixed(instrument.is_rate ? 3 : 2)}` : ""}</span>
              <span>({pctLabel(dayChange)})</span>
              <span className="text-muted-foreground font-normal text-xs ml-1">Today</span>
            </div>
          </div>

          {/* Quick stat pills */}
          <div className="flex flex-wrap gap-2">
            {weekPct !== null && period !== "1d" && period !== "5d" && (
              <StatPill label="1W" value={pctLabel(weekPct)} positive={weekPct >= 0} />
            )}
            {periodPct !== null && (
              <StatPill label={currentPeriodLabel} value={pctLabel(periodPct)} positive={periodPct >= 0} />
            )}
            {high52 !== null && (
              <StatPill label="Period High" value={fmtPrice(high52, instrument.is_rate)} />
            )}
            {low52 !== null && (
              <StatPill label="Period Low" value={fmtPrice(low52, instrument.is_rate)} />
            )}
            {avg !== null && (
              <StatPill label="Period Avg" value={fmtPrice(avg, instrument.is_rate)} />
            )}
          </div>
        </div>

        {/* ── Chart controls ── */}
        <div className="border-b bg-muted/20 shrink-0">
          {/* Period + sub-pane toggles */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5">
            <div className="flex gap-0.5 flex-wrap">
              {PERIODS.map(({ label, value }) => (
                <Button key={value} variant={period === value ? "default" : "ghost"} size="sm"
                  className="h-7 px-2.5 text-xs" onClick={() => setPeriod(value)} disabled={loading}>
                  {label}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none text-muted-foreground hover:text-foreground">
                <input type="checkbox" checked={showRSI} onChange={(e) => setShowRSI(e.target.checked)} className="h-3 w-3 rounded" />
                RSI
              </label>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none text-muted-foreground hover:text-foreground">
                <input type="checkbox" checked={showMACD} onChange={(e) => setShowMACD(e.target.checked)} className="h-3 w-3 rounded" />
                MACD
              </label>
            </div>
          </div>

          {/* MA section */}
          <div className="border-t px-5 py-2.5 space-y-2">
            {/* Preset MA pills + toggle for custom builder */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mr-1">MA:</span>
              {MA_PRESETS.map((preset) => {
                const isActive = customMAs.some((m) => m.id === `${preset.type}-${preset.period}`);
                return (
                  <button
                    key={`${preset.type}-${preset.period}`}
                    onClick={() => togglePresetMA(preset)}
                    className="rounded-full border px-2 py-0.5 text-[11px] font-medium transition-all"
                    style={isActive
                      ? { background: preset.color, borderColor: preset.color, color: "#fff" }
                      : { borderColor: preset.color + "50", color: preset.color }}
                  >
                    {preset.type} {preset.period}
                  </button>
                );
              })}
              <button
                onClick={() => setShowMABuilder((v) => !v)}
                className={`flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${showMABuilder ? "bg-primary/10 border-primary/40 text-primary" : "border-dashed border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}
              >
                <Plus className="h-2.5 w-2.5" />Custom
              </button>

              {/* Active custom MAs */}
              {customMAs.filter((m) => !MA_PRESETS.some((p) => `${p.type}-${p.period}` === m.id)).map((ma) => (
                <div key={ma.id} className="flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
                  style={{ background: ma.color }}>
                  {ma.type} {ma.period}
                  <button onClick={() => removeMA(ma.id)} className="hover:opacity-70 ml-0.5"><X className="h-2.5 w-2.5" /></button>
                </div>
              ))}
            </div>

            {/* Custom MA builder (expandable) */}
            {showMABuilder && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-background p-2">
                <select value={maType} onChange={(e) => setMaType(e.target.value as "SMA" | "EMA")}
                  className="rounded border bg-background px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary">
                  <option>SMA</option>
                  <option>EMA</option>
                </select>
                <input type="number" value={maPeriod}
                  onChange={(e) => setMaPeriod(Math.max(2, Math.min(500, Number(e.target.value))))}
                  min={2} max={500}
                  onKeyDown={(e) => e.key === "Enter" && addCustomMA()}
                  className="w-16 rounded border bg-background px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="20"
                />
                <div className="flex gap-1 items-center">
                  {MA_PALETTE.map((color) => (
                    <button key={color} onClick={() => setMaColor(color)} title={color}
                      className="h-4 w-4 rounded-full border-2 transition-transform hover:scale-110"
                      style={{ background: color, borderColor: maColor === color ? "#000" : "transparent",
                        outline: maColor === color ? `2px solid ${color}` : "none", outlineOffset: "1px" }}
                    />
                  ))}
                </div>
                <button onClick={addCustomMA}
                  className="rounded bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                  Add
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Chart ── */}
        <div className="relative p-4 flex-1">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded bg-background/60 backdrop-blur-sm">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}
          <div ref={mainRef} className="w-full" />
          {showRSI && (
            <div className="mt-1">
              <p className="px-1 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">RSI (14) — purple · OB/OS: 70/30</p>
              <div ref={rsiRef} className="w-full" />
            </div>
          )}
          {showMACD && (
            <div className="mt-1">
              <p className="px-1 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">MACD (12,26,9) — blue=MACD · orange=Signal · bars=Histogram</p>
              <div ref={macdRef} className="w-full" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatPill({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  const colorClass = positive === true ? "text-green-600" : positive === false ? "text-red-500" : "text-foreground";
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-1.5 text-xs">
      <p className="text-muted-foreground leading-none mb-0.5">{label}</p>
      <p className={`font-bold leading-none ${colorClass}`}>{value}</p>
    </div>
  );
}
