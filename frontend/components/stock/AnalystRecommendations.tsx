"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { AnalystData } from "@/lib/types";
import { formatCurrency } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BeginnerTip } from "@/components/common/BeginnerTip";

interface Props {
  analyst: AnalystData;
  currentPrice?: number;
}

export function AnalystRecommendations({ analyst, currentPrice }: Props) {
  const trends = analyst.recommendation_trends;
  const targets = analyst.price_targets;

  const totalAnalysts = trends
    ? trends.strong_buy + trends.buy + trends.hold + trends.sell + trends.strong_sell
    : 0;

  const chartData = trends
    ? [
        { label: "Strong Buy", count: trends.strong_buy, fill: "#16a34a" },
        { label: "Buy", count: trends.buy, fill: "#4ade80" },
        { label: "Hold", count: trends.hold, fill: "#f59e0b" },
        { label: "Sell", count: trends.sell, fill: "#f87171" },
        { label: "Strong Sell", count: trends.strong_sell, fill: "#dc2626" },
      ]
    : [];

  const bullishCount = (trends?.strong_buy ?? 0) + (trends?.buy ?? 0);
  const consensus =
    bullishCount / totalAnalysts > 0.6
      ? "Strong Buy"
      : bullishCount / totalAnalysts > 0.4
      ? "Moderate Buy"
      : trends?.hold ?? 0 / totalAnalysts > 0.5
      ? "Hold"
      : "Sell";

  const upside = currentPrice && targets?.target_consensus
    ? ((targets.target_consensus - currentPrice) / currentPrice) * 100
    : null;

  return (
    <div className="space-y-4">
      {trends && totalAnalysts > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Analyst Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              Consensus: <span className="font-semibold text-foreground">{consensus}</span> based on {totalAnalysts} analysts
            </p>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={80} />
                  <Tooltip formatter={(val) => [`${val} analysts`, ""]} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {chartData.map((entry, i) => (
                      <rect key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {targets && (
        <Card>
          <CardHeader>
            <CardTitle>Price Targets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-md bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Low Target</p>
                <p className="font-semibold">{formatCurrency(targets.target_low)}</p>
              </div>
              <div className="rounded-md bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Median Target</p>
                <p className="font-semibold">{formatCurrency(targets.target_median)}</p>
              </div>
              <div className="rounded-md bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Consensus Target</p>
                <p className="font-semibold">{formatCurrency(targets.target_consensus)}</p>
              </div>
              <div className="rounded-md bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">High Target</p>
                <p className="font-semibold">{formatCurrency(targets.target_high)}</p>
              </div>
            </div>
            {upside !== null && (
              <p className={`mt-3 text-sm font-medium ${upside >= 0 ? "text-green-600" : "text-red-600"}`}>
                Analyst consensus implies {upside >= 0 ? "+" : ""}{upside.toFixed(1)}% {upside >= 0 ? "upside" : "downside"} from current price
              </p>
            )}
            <BeginnerTip title="What are price targets?" className="mt-4">
              Wall Street analysts estimate where a stock price will be in 12 months. The consensus is the average of all analyst targets.
            </BeginnerTip>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
