"use client";

import { useState } from "react";
import type { IncomeStatement, BalanceSheet, CashFlow } from "@/lib/types";
import { formatLargeNumber, formatPercent } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Statement = "income" | "balance" | "cashflow";

interface Props {
  income: IncomeStatement[];
  balance: BalanceSheet[];
  cashflow: CashFlow[];
}

const INCOME_ROWS: { label: string; key: keyof IncomeStatement; format?: "pct" }[] = [
  { label: "Revenue", key: "revenue" },
  { label: "Gross Profit", key: "gross_profit" },
  { label: "Gross Margin", key: "gross_margin", format: "pct" },
  { label: "Operating Income", key: "operating_income" },
  { label: "Operating Margin", key: "operating_margin", format: "pct" },
  { label: "EBITDA", key: "ebitda" },
  { label: "Net Income", key: "net_income" },
  { label: "Net Margin", key: "net_margin", format: "pct" },
  { label: "EPS (Diluted)", key: "eps_diluted" },
  { label: "R&D Expenses", key: "rd_expenses" },
];

const BALANCE_ROWS: { label: string; key: keyof BalanceSheet }[] = [
  { label: "Cash & Equivalents", key: "cash" },
  { label: "Total Current Assets", key: "total_current_assets" },
  { label: "Total Assets", key: "total_assets" },
  { label: "Total Current Liabilities", key: "total_current_liabilities" },
  { label: "Total Liabilities", key: "total_liabilities" },
  { label: "Total Equity", key: "total_equity" },
  { label: "Total Debt", key: "total_debt" },
  { label: "Net Debt", key: "net_debt" },
];

const CASHFLOW_ROWS: { label: string; key: keyof CashFlow }[] = [
  { label: "Operating Cash Flow", key: "operating_cash_flow" },
  { label: "Investing Cash Flow", key: "investing_cash_flow" },
  { label: "Financing Cash Flow", key: "financing_cash_flow" },
  { label: "Free Cash Flow", key: "free_cash_flow" },
  { label: "CapEx", key: "capex" },
  { label: "Depreciation & Amortization", key: "depreciation" },
  { label: "Dividends Paid", key: "dividends_paid" },
];

const KEY_ROWS = new Set(["Revenue", "Net Income", "Free Cash Flow", "Total Assets", "Total Equity"]);

function fmt(val: unknown, isPct?: boolean): string {
  if (val == null) return "—";
  const n = Number(val);
  if (isPct) return formatPercent(n);
  if (Math.abs(n) < 100) return n.toFixed(2);
  return formatLargeNumber(n).replace("$", "");
}

function isNegative(val: unknown): boolean {
  return typeof val === "number" && val < 0;
}

export function FinancialTable({ income, balance, cashflow }: Props) {
  const [statement, setStatement] = useState<Statement>("income");

  const rows =
    statement === "income" ? INCOME_ROWS :
    statement === "balance" ? BALANCE_ROWS :
    CASHFLOW_ROWS;

  const data: (IncomeStatement | BalanceSheet | CashFlow)[] =
    statement === "income" ? income :
    statement === "balance" ? balance :
    cashflow;

  const years = data.map((d) => d.date.slice(0, 4));

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["income", "balance", "cashflow"] as Statement[]).map((s) => (
          <Button
            key={s}
            variant={statement === s ? "default" : "outline"}
            size="sm"
            onClick={() => setStatement(s)}
          >
            {s === "income" ? "Income Statement" : s === "balance" ? "Balance Sheet" : "Cash Flow"}
          </Button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                (USD)
              </th>
              {years.map((y) => (
                <th key={y} className="px-4 py-3 text-right text-xs font-medium uppercase text-muted-foreground">
                  {y}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => {
              const isKey = KEY_ROWS.has(row.label);
              return (
                <tr key={row.key} className={cn("hover:bg-muted/20", isKey && "bg-muted/10")}>
                  <td className={cn("px-4 py-2", isKey && "font-semibold")}>{row.label}</td>
                  {data.map((d, i) => {
                    const val = (d as unknown as Record<string, unknown>)[row.key];
                    const neg = isNegative(val);
                    return (
                      <td
                        key={i}
                        className={cn(
                          "px-4 py-2 text-right tabular-nums",
                          isKey && "font-semibold",
                          neg && "text-red-600",
                          !neg && typeof val === "number" && val > 0 && isKey && "text-green-700"
                        )}
                      >
                        {fmt(val, "format" in row && row.format === "pct")}
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
  );
}
