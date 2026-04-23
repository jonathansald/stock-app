"use client";

import dynamic from "next/dynamic";
import { useRef, useEffect, useCallback, useState } from "react";
import type { FrontierPoint } from "@/lib/types";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface Props {
  points: FrontierPoint[];
  optimalReturn: number;
  optimalVolatility: number;
  sharpeRatio?: number;
  selectedIndex?: number | null;
  onPointClick?: (point: FrontierPoint, index: number) => void;
}

interface HoveredInfo {
  ret: number;
  vol: number;
  sharpe: number;
  weights: Record<string, number>;
}

export function EfficientFrontierChart({
  points,
  optimalReturn,
  optimalVolatility,
  sharpeRatio,
  selectedIndex,
  onPointClick,
}: Props) {
  const onPointClickRef = useRef(onPointClick);
  const pointsRef = useRef(points);
  useEffect(() => { onPointClickRef.current = onPointClick; }, [onPointClick]);
  useEffect(() => { pointsRef.current = points; }, [points]);

  const [revision, setRevision] = useState(0);
  useEffect(() => { setRevision((r) => r + 1); }, [selectedIndex]);

  const [hovered, setHovered] = useState<HoveredInfo | null>(null);

  // Attach native Plotly events on init — more reliable than React prop bindings
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleInitialized = useCallback((_figure: any, graphDiv: any) => {
    if (!graphDiv?.on) return;

    // Click → update selected allocation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    graphDiv.on("plotly_click", (eventData: any) => {
      const pt = eventData?.points?.[0];
      if (!pt || pt.curveNumber !== 0) return;
      const idx: number = pt.pointIndex;
      if (idx >= 0 && idx < pointsRef.current.length) {
        onPointClickRef.current?.(pointsRef.current[idx], idx);
      }
    });

    // Hover → show custom tooltip in React (not Plotly's built-in, so it never covers points)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    graphDiv.on("plotly_hover", (eventData: any) => {
      const pt = eventData?.points?.[0];
      if (!pt || pt.curveNumber !== 0) return;
      const idx: number = pt.pointIndex;
      const p = pointsRef.current[idx];
      if (p) setHovered({ ret: p.return, vol: p.volatility, sharpe: p.sharpe, weights: p.weights });
    });

    graphDiv.on("plotly_unhover", () => setHovered(null));
  }, []);

  const x = points.map((p) => +(p.volatility * 100).toFixed(2));
  const y = points.map((p) => +(p.return * 100).toFixed(2));
  const sharpe = points.map((p) => +p.sharpe.toFixed(3));

  const markerSizes = points.map((_, i) => (selectedIndex === i ? 18 : 7));
  const markerColors = points.map((_, i) =>
    selectedIndex === i ? "#f97316" : undefined
  );
  const markerSymbols = points.map((_, i) =>
    selectedIndex === i ? "star" : "circle"
  );
  const markerLineColors = points.map((_, i) =>
    selectedIndex === i ? "white" : "rgba(0,0,0,0.1)"
  );
  const markerLineWidths = points.map((_, i) => (selectedIndex === i ? 2 : 0.5));

  const optLabel =
    `<b>★ Optimal</b>  Return: ${(optimalReturn * 100).toFixed(1)}%  ` +
    `Vol: ${(optimalVolatility * 100).toFixed(1)}%` +
    (sharpeRatio != null ? `  Sharpe: ${sharpeRatio.toFixed(2)}` : "");

  const data: Plotly.Data[] = [
    {
      x,
      y,
      mode: "lines+markers",
      type: "scatter",
      hoverinfo: "none" as Plotly.PlotData["hoverinfo"], // custom React tooltip handles hover
      line: { color: "rgba(148,163,184,0.35)", width: 1.5 },
      marker: {
        // Use sharpe colorscale for unselected; override selected to orange star
        color: points.map((p, i) => selectedIndex === i ? "#f97316" : +p.sharpe.toFixed(3)),
        colorscale: "Viridis",
        showscale: false,
        size: markerSizes,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        symbol: markerSymbols as any,
        line: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          color: markerLineColors as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          width: markerLineWidths as any,
        },
      },
      name: "Frontier",
    },
    // Optimal star (only shown when no custom point is selected)
    ...(selectedIndex == null
      ? [{
          x: [+(optimalVolatility * 100).toFixed(2)],
          y: [+(optimalReturn * 100).toFixed(2)],
          mode: "markers" as Plotly.PlotData["mode"],
          type: "scatter" as Plotly.PlotData["type"],
          marker: {
            color: "#2563eb",
            size: 22,
            symbol: "star" as Plotly.MarkerSymbol,
            line: { color: "white", width: 2.5 },
          },
          name: "★ Optimal",
          hoverinfo: "text" as Plotly.PlotData["hoverinfo"],
          text: [optLabel],
        }]
      : []),
  ];

  const layout: Partial<Plotly.Layout> = {
    xaxis: {
      title: { text: "Volatility (%)", font: { size: 11 } },
      zeroline: false,
      gridcolor: "rgba(0,0,0,0.06)",
      tickfont: { size: 10 },
    },
    yaxis: {
      title: { text: "Expected Return (%)", font: { size: 11 } },
      zeroline: false,
      gridcolor: "rgba(0,0,0,0.06)",
      tickfont: { size: 10 },
    },
    legend: {
      x: 0.01, y: 0.99,
      bgcolor: "rgba(255,255,255,0.75)",
      bordercolor: "rgba(0,0,0,0.08)",
      borderwidth: 1,
      font: { size: 10 },
    },
    margin: { t: 10, r: 20, b: 50, l: 55 },
    paper_bgcolor: "transparent",
    plot_bgcolor: "transparent",
    font: { size: 11 },
    hovermode: "closest",
  };

  // Top weights for hover panel
  const topWeights = hovered
    ? Object.entries(hovered.weights)
        .sort(([, a], [, b]) => b - a)
        .filter(([, w]) => w > 0.005)
        .slice(0, 6)
    : [];

  return (
    <div className="relative">
      <div className="h-72 w-full" style={{ cursor: "pointer" }}>
        <Plot
          data={data}
          layout={layout}
          revision={revision}
          config={{ displayModeBar: false, responsive: true }}
          style={{ width: "100%", height: "100%" }}
          onInitialized={handleInitialized}
        />
      </div>

      {/* Custom hover tooltip — rendered in React, always below the chart, never covers points */}
      <div
        className={`mt-2 rounded-lg border bg-card px-3 py-2 text-xs transition-opacity duration-100 ${
          hovered ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        style={{ minHeight: 56 }}
      >
        {hovered ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span className="font-semibold text-foreground">
              Return: <span className="text-green-600">{(hovered.ret * 100).toFixed(1)}%</span>
            </span>
            <span className="font-semibold text-foreground">
              Vol: <span className="text-orange-500">{(hovered.vol * 100).toFixed(1)}%</span>
            </span>
            <span className="font-semibold text-foreground">
              Sharpe: <span className="text-blue-600">{hovered.sharpe.toFixed(2)}</span>
            </span>
            <span className="w-full mt-0.5 text-muted-foreground">
              {topWeights.map(([t, w]) => `${t} ${(w * 100).toFixed(1)}%`).join("  ·  ")}
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground">Hover a point to see allocation</span>
        )}
      </div>
    </div>
  );
}
