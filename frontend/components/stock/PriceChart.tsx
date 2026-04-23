"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  AreaSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
  type Time,
} from "lightweight-charts";
import { useTheme } from "next-themes";
import { getHistory } from "@/lib/api";
import type { HistoricalPrice } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/formatters";

const PERIODS = ["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y"] as const;
type Period = (typeof PERIODS)[number];
type ChartType = "candle" | "area";

interface Props {
  ticker: string;
  initialData: HistoricalPrice[];
  initialPeriod?: string;
}

function getThemeColors(isDark: boolean) {
  return {
    background: isDark ? "#09090b" : "#ffffff",
    text: isDark ? "#a1a1aa" : "#71717a",
    grid: isDark ? "#27272a" : "#f4f4f5",
    border: isDark ? "#27272a" : "#e4e4e7",
    upColor: "#16a34a",
    downColor: "#dc2626",
    upFill: "rgba(22,163,74,0.12)",
    downFill: "rgba(220,38,38,0.12)",
    volUp: "rgba(22,163,74,0.4)",
    volDown: "rgba(220,38,38,0.4)",
  };
}

function toTime(d: HistoricalPrice): Time {
  // intraday data has numeric Unix timestamps; daily has "YYYY-MM-DD" strings
  return (typeof d.date === "number" ? d.date : d.date) as Time;
}

export function PriceChart({ ticker, initialData, initialPeriod = "1y" }: Props) {
  const [period, setPeriod] = useState<Period>(initialPeriod as Period);
  const [data, setData] = useState<HistoricalPrice[]>(initialData);
  const [loading, setLoading] = useState(false);
  const [chartType, setChartType] = useState<ChartType>("candle");

  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mainSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  const first = data[0]?.close ?? 0;
  const last = data[data.length - 1]?.close ?? 0;
  const change = last - first;
  const changePct = first > 0 ? (change / first) * 100 : 0;
  const isPositive = change >= 0;

  const buildChart = useCallback(() => {
    if (!containerRef.current) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      mainSeriesRef.current = null;
      volumeSeriesRef.current = null;
    }

    const colors = getThemeColors(isDark);
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.text,
        fontFamily: "inherit",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: colors.border,
        scaleMargins: { top: 0.08, bottom: 0.22 },
      },
      timeScale: {
        borderColor: colors.border,
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: true,
      handleScale: true,
    });

    chartRef.current = chart;

    if (chartType === "candle") {
      const series = chart.addSeries(CandlestickSeries, {
        upColor: colors.upColor,
        downColor: colors.downColor,
        borderUpColor: colors.upColor,
        borderDownColor: colors.downColor,
        wickUpColor: colors.upColor,
        wickDownColor: colors.downColor,
      });
      series.setData(
        data.map((d) => ({
          time: toTime(d),
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
        }))
      );
      mainSeriesRef.current = series;
    } else {
      const lineColor = isPositive ? colors.upColor : colors.downColor;
      const series = chart.addSeries(AreaSeries, {
        lineColor,
        topColor: isPositive ? colors.upFill : colors.downFill,
        bottomColor: "transparent",
        lineWidth: 2,
        priceLineVisible: false,
      });
      series.setData(
        data.map((d) => ({
          time: toTime(d),
          value: d.close,
        }))
      );
      mainSeriesRef.current = series;
    }

    const volSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });
    volSeries.setData(
      data.map((d) => ({
        time: toTime(d),
        value: d.volume,
        color: d.close >= d.open ? colors.volUp : colors.volDown,
      }))
    );
    volumeSeriesRef.current = volSeries;

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [data, chartType, isDark, isPositive]);

  useEffect(() => {
    const cleanup = buildChart();
    return () => {
      cleanup?.();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [buildChart]);

  const handlePeriodChange = async (p: Period) => {
    if (p === period) return;
    setPeriod(p);
    setLoading(true);
    try {
      const result = await getHistory(ticker, p);
      setData(result.data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <h2 className="font-semibold">Price History</h2>
          {data.length > 0 && (
            <span className={`text-sm font-medium ${isPositive ? "text-green-600" : "text-red-600"}`}>
              {isPositive ? "+" : ""}{changePct.toFixed(2)}%&nbsp;({isPositive ? "+" : ""}{formatCurrency(change)})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-md border">
            <button
              onClick={() => setChartType("candle")}
              className={`px-2.5 py-1 text-xs font-medium transition-colors ${chartType === "candle" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
            >
              Candle
            </button>
            <button
              onClick={() => setChartType("area")}
              className={`px-2.5 py-1 text-xs font-medium transition-colors ${chartType === "area" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
            >
              Area
            </button>
          </div>
          <div className="flex gap-0.5">
            {PERIODS.map((p) => (
              <Button
                key={p}
                variant={period === p ? "default" : "ghost"}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => handlePeriodChange(p)}
                disabled={loading}
              >
                {p}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="relative">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-background/60 backdrop-blur-sm">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}
        <div ref={containerRef} className="h-72 w-full" />
      </div>
    </div>
  );
}
