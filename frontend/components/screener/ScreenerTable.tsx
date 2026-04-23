"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronUp, ChevronDown, TrendingUp, X } from "lucide-react";
import Link from "next/link";
import type { ScreenerStock } from "@/lib/types";
import { formatCurrency, formatLargeNumber } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
import { WatchlistButton } from "@/components/common/WatchlistButton";

interface AnalystData {
  recommendation?: string;
  target_consensus?: number;
}

interface Props {
  stocks: ScreenerStock[];
  analystData?: Record<string, AnalystData>;
  earningsData?: Record<string, string | null>;
  selected?: Set<string>;
  onSelectionChange?: (next: Set<string>, names: Record<string, string>) => void;
}

type SortKey = keyof ScreenerStock;

const REC_COLORS: Record<string, string> = {
  "Strong Buy": "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  "Buy":        "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  "Neutral":    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  "Sell":       "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  "Strong Sell":"bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

function formatEarningsDate(dateStr: string | null | undefined): { label: string; soon: boolean } {
  if (!dateStr) return { label: "—", soon: false };
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return { label: "—", soon: false };
    const now = new Date();
    const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return { label, soon: diffDays >= 0 && diffDays <= 14 };
  } catch {
    return { label: "—", soon: false };
  }
}

export function ScreenerTable({ stocks, analystData = {}, earningsData = {}, selected: externalSelected, onSelectionChange }: Props) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>("market_cap");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  // Use external selection if provided (persists across filter changes), else local
  const [localSelected, setLocalSelected] = useState<Set<string>>(new Set());
  const selected = externalSelected ?? localSelected;

  const hasAnalystData = Object.keys(analystData).length > 0;
  const hasEarningsData = Object.keys(earningsData).length > 0;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = [...stocks].sort((a, b) => {
    const av = a[sortKey] ?? 0;
    const bv = b[sortKey] ?? 0;
    if (typeof av === "string" && typeof bv === "string")
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortDir === "asc" ? Number(av) - Number(bv) : Number(bv) - Number(av);
  });

  const updateSelection = (next: Set<string>, changedStock?: ScreenerStock) => {
    if (onSelectionChange) {
      const names: Record<string, string> = {};
      if (changedStock) names[changedStock.ticker] = changedStock.name;
      // also pass all currently visible stocks for name resolution
      stocks.forEach((s) => { names[s.ticker] = s.name; });
      onSelectionChange(next, names);
    } else {
      setLocalSelected(next);
    }
  };

  const toggleSelect = (stock: ScreenerStock, e: React.MouseEvent | React.ChangeEvent) => {
    e.stopPropagation();
    const next = new Set(selected);
    if (next.has(stock.ticker)) next.delete(stock.ticker); else next.add(stock.ticker);
    updateSelection(next, stock);
  };

  const clearSelected = () => updateSelection(new Set());

  const portfolioUrl = `/portfolio?tickers=${[...selected].join(",")}`;

  const SortIcon = ({ col }: { col: SortKey }) =>
    sortKey === col ? (
      sortDir === "asc" ? <ChevronUp className="inline h-3 w-3" /> : <ChevronDown className="inline h-3 w-3" />
    ) : null;

  const th = (label: string, col: SortKey) => (
    <th
      className="cursor-pointer select-none whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground"
      onClick={() => handleSort(col)}
    >
      {label} <SortIcon col={col} />
    </th>
  );

  if (sorted.length === 0) {
    return (
      <div className="rounded-lg border py-12 text-center text-muted-foreground">
        No stocks found. Try adjusting your filters.
      </div>
    );
  }

  return (
    <>
      {/* Selection action bar */}
      {selected.size > 0 && (
        <div className="sticky top-14 z-30 flex items-center justify-between rounded-lg border bg-primary/5 px-4 py-2.5 shadow-sm">
          <span className="text-sm font-medium">
            {selected.size} stock{selected.size !== 1 ? "s" : ""} selected
          </span>
          <div className="flex items-center gap-2">
            <Link
              href={portfolioUrl}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <TrendingUp className="h-3.5 w-3.5" />
              Build Portfolio
            </Link>
            <button
              onClick={clearSelected}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-lg border sm:block">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-3 py-3 text-left">
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer rounded"
                  checked={selected.size === sorted.length && sorted.length > 0}
                  onChange={(e) => {
                    e.stopPropagation();
                    if (selected.size === sorted.length) clearSelected();
                    else updateSelection(new Set(sorted.map((s) => s.ticker)));
                  }}
                  aria-label="Select all"
                />
              </th>
              {th("Ticker", "ticker")}
              {th("Company", "name")}
              {th("Sector", "sector")}
              {th("Price", "price")}
              {th("Market Cap", "market_cap")}
              {th("Beta", "beta")}
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Exchange</th>
              {hasAnalystData && (
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Rating</th>
              )}
              {hasAnalystData && (
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Upside</th>
              )}
              {hasEarningsData && (
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Next Earnings</th>
              )}
              <th className="px-2 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {sorted.map((stock) => {
              const ad = analystData[stock.ticker];
              const upside = ad?.target_consensus && stock.price
                ? ((ad.target_consensus - stock.price) / stock.price) * 100
                : null;
              const isSelected = selected.has(stock.ticker);
              return (
                <tr
                  key={stock.ticker}
                  className={`cursor-pointer transition-colors hover:bg-muted/30 ${isSelected ? "bg-primary/5" : ""}`}
                  onClick={() => router.push(`/stock/${stock.ticker}`)}
                >
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer rounded"
                      checked={isSelected}
                      onChange={(e) => toggleSelect(stock, e)}
                      aria-label={`Select ${stock.ticker}`}
                    />
                  </td>
                  <td className="px-4 py-3 font-semibold text-primary">{stock.ticker}</td>
                  <td className="max-w-[180px] truncate px-4 py-3">{stock.name}</td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary" className="text-xs">{stock.sector || "—"}</Badge>
                  </td>
                  <td className="px-4 py-3 font-medium">{formatCurrency(stock.price)}</td>
                  <td className="px-4 py-3">{formatLargeNumber(stock.market_cap)}</td>
                  <td className="px-4 py-3">{stock.beta?.toFixed(2) ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{stock.exchange}</td>
                  {hasAnalystData && (
                    <td className="px-4 py-3">
                      {ad?.recommendation ? (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${REC_COLORS[ad.recommendation] ?? "bg-muted text-muted-foreground"}`}>
                          {ad.recommendation}
                        </span>
                      ) : "—"}
                    </td>
                  )}
                  {hasAnalystData && (
                    <td className={`px-4 py-3 font-medium ${upside !== null ? (upside >= 0 ? "text-green-600" : "text-red-600") : ""}`}>
                      {upside !== null ? `${upside >= 0 ? "+" : ""}${upside.toFixed(1)}%` : "—"}
                    </td>
                  )}
                  {hasEarningsData && (() => {
                    const { label, soon } = formatEarningsDate(earningsData[stock.ticker]);
                    return (
                      <td className="px-4 py-3">
                        {soon ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                            ⚡ {label}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">{label}</span>
                        )}
                      </td>
                    );
                  })()}
                  <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                    <WatchlistButton ticker={stock.ticker} name={stock.name} size="sm" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="flex flex-col gap-2 sm:hidden">
        {sorted.map((stock) => {
          const ad = analystData[stock.ticker];
          const upside = ad?.target_consensus && stock.price
            ? ((ad.target_consensus - stock.price) / stock.price) * 100
            : null;
          const isSelected = selected.has(stock.ticker);
          return (
            <div
              key={stock.ticker}
              role="button"
              tabIndex={0}
              className={`w-full rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted/30 active:bg-muted/50 cursor-pointer ${isSelected ? "border-primary/50 bg-primary/5" : ""}`}
              onClick={() => router.push(`/stock/${stock.ticker}`)}
              onKeyDown={(e) => e.key === "Enter" && router.push(`/stock/${stock.ticker}`)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 cursor-pointer rounded flex-shrink-0"
                    checked={isSelected}
                    onChange={(e) => toggleSelect(stock, e)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Select ${stock.ticker}`}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-primary">{stock.ticker}</span>
                      <Badge variant="secondary" className="text-xs">{stock.sector || "—"}</Badge>
                      {ad?.recommendation && (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${REC_COLORS[ad.recommendation] ?? "bg-muted text-muted-foreground"}`}>
                          {ad.recommendation}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">{stock.name}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 shrink-0">
                  <div className="text-right">
                    <p className="font-semibold">{formatCurrency(stock.price)}</p>
                    <p className="text-xs text-muted-foreground">{formatLargeNumber(stock.market_cap)}</p>
                    {upside !== null && (
                      <p className={`text-xs font-medium ${upside >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {upside >= 0 ? "+" : ""}{upside.toFixed(1)}% upside
                      </p>
                    )}
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <WatchlistButton ticker={stock.ticker} name={stock.name} size="sm" />
                  </div>
                </div>
              </div>
              <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                <span>Beta: <span className="font-medium text-foreground">{stock.beta?.toFixed(2) ?? "—"}</span></span>
                <span>Exchange: <span className="font-medium text-foreground">{stock.exchange || "—"}</span></span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
