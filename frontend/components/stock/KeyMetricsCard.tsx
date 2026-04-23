import type { KeyMetrics } from "@/lib/types";
import { formatPercent, formatNumber } from "@/lib/formatters";
import { BeginnerTip } from "@/components/common/BeginnerTip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  metrics: KeyMetrics;
}

const METRIC_TIPS: Record<string, string> = {
  "P/E Ratio": "Price-to-Earnings: how much you pay for $1 of company profit. Lower = cheaper. A P/E of 20 means you pay $20 for every $1 of annual earnings.",
  "P/B Ratio": "Price-to-Book: compares stock price to the company's net assets. A P/B below 1 means you're buying assets below their book value.",
  "ROE": "Return on Equity: how efficiently the company uses shareholder money to generate profit. Above 15% is generally considered good.",
  "Dividend Yield": "Annual dividend payment divided by stock price. A 3% yield means you earn $3 per year for every $100 invested.",
};

export function KeyMetricsCard({ metrics }: Props) {
  const items = [
    { label: "P/E Ratio", value: metrics.pe_ratio ? formatNumber(metrics.pe_ratio, 1) : "—" },
    { label: "P/B Ratio", value: metrics.pb_ratio ? formatNumber(metrics.pb_ratio, 2) : "—" },
    { label: "P/S Ratio", value: metrics.ps_ratio ? formatNumber(metrics.ps_ratio, 2) : "—" },
    { label: "EV/EBITDA", value: metrics.ev_ebitda ? formatNumber(metrics.ev_ebitda, 1) : "—" },
    { label: "ROE", value: metrics.roe ? formatPercent(metrics.roe) : "—" },
    { label: "ROA", value: metrics.roa ? formatPercent(metrics.roa) : "—" },
    { label: "Debt/Equity", value: metrics.debt_to_equity ? formatNumber(metrics.debt_to_equity, 2) : "—" },
    { label: "Current Ratio", value: metrics.current_ratio ? formatNumber(metrics.current_ratio, 2) : "—" },
    { label: "Dividend Yield", value: metrics.dividend_yield ? formatPercent(metrics.dividend_yield) : "—" },
    { label: "FCF Yield", value: metrics.free_cash_flow_yield ? formatPercent(metrics.free_cash_flow_yield) : "—" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Key Metrics</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {items.map((item) => (
            <div key={item.label} className="rounded-md bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="mt-0.5 text-base font-semibold">{item.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          {Object.entries(METRIC_TIPS).slice(0, 2).map(([label, tip]) => (
            <BeginnerTip key={label} title={label} className="py-2">
              {tip}
            </BeginnerTip>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
