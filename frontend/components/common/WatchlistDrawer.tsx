"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Bookmark, X, Trash2, TrendingUp, ArrowUpRight, ArrowDownRight, CheckSquare, Square,
} from "lucide-react";
import { useWatchlist } from "@/components/providers/WatchlistProvider";
import { getQuote } from "@/lib/api";
import type { Quote } from "@/lib/types";
import { formatCurrency } from "@/lib/formatters";

export function WatchlistDrawer() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { items, remove, clear } = useWatchlist();
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Reset selection when items change
  useEffect(() => {
    setSelected((prev) => {
      const valid = new Set([...prev].filter((t) => items.some((i) => i.ticker === t)));
      return valid;
    });
  }, [items]);

  // Fetch prices when drawer opens
  useEffect(() => {
    if (!open || items.length === 0) return;
    setLoadingPrices(true);
    Promise.all(
      items.map((item) =>
        getQuote(item.ticker)
          .then((q) => [item.ticker, q] as const)
          .catch(() => null)
      )
    ).then((results) => {
      const map: Record<string, Quote> = {};
      results.forEach((r) => { if (r) map[r[0]] = r[1]; });
      setQuotes(map);
      setLoadingPrices(false);
    });
  }, [open, items]);

  const toggleSelect = (ticker: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker); else next.add(ticker);
      return next;
    });
  };

  const allSelected = items.length > 0 && selected.size === items.length;
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(items.map((i) => i.ticker)));
  };

  const activeTickers = selected.size > 0 ? [...selected] : items.map((i) => i.ticker);
  const portfolioUrl = activeTickers.length > 0
    ? `/portfolio?tickers=${activeTickers.join(",")}`
    : "/portfolio";

  const goToPortfolio = () => {
    setOpen(false);
    router.push(portfolioUrl);
  };

  return (
    <>
      {/* Trigger */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Open watchlist"
        className="relative flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Bookmark className="h-4 w-4" />
        {items.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
            {items.length > 9 ? "9+" : items.length}
          </span>
        )}
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed right-0 top-0 z-50 flex h-full w-[400px] flex-col border-l border-border bg-card shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Bookmark className="h-5 w-5 text-primary" />
            <span className="text-lg font-bold text-foreground">Watchlist</span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              {items.length}
            </span>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Select-all bar (only when items exist) */}
        {items.length > 0 && (
          <div className="flex items-center justify-between border-b border-border bg-muted/40 px-5 py-2">
            <button
              onClick={toggleAll}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {allSelected
                ? <CheckSquare className="h-3.5 w-3.5 text-primary" />
                : <Square className="h-3.5 w-3.5" />}
              {allSelected ? "Deselect all" : "Select all"}
            </button>
            {selected.size > 0 && (
              <span className="text-xs font-medium text-primary">
                {selected.size} selected
              </span>
            )}
          </div>
        )}

        {/* Items */}
        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center px-6">
              <div className="rounded-full bg-muted p-4">
                <Bookmark className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <p className="font-semibold text-foreground">No stocks saved yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Tap the bookmark icon on any stock page or screener row to save it here.
                </p>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((item) => {
                const q = quotes[item.ticker];
                const positive = (q?.change_pct ?? 0) >= 0;
                const isSelected = selected.has(item.ticker);

                return (
                  <li
                    key={item.ticker}
                    className={`flex items-center gap-3 px-4 py-3.5 transition-colors ${
                      isSelected ? "bg-primary/5" : "hover:bg-muted/30"
                    }`}
                  >
                    {/* Checkbox */}
                    <button
                      onClick={() => toggleSelect(item.ticker)}
                      className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                      aria-label={`Select ${item.ticker}`}
                    >
                      {isSelected
                        ? <CheckSquare className="h-4 w-4 text-primary" />
                        : <Square className="h-4 w-4" />}
                    </button>

                    {/* Ticker badge */}
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                      {item.ticker.length <= 4 ? item.ticker : item.ticker.slice(0, 4)}
                    </div>

                    {/* Name + price — navigates to stock page */}
                    <Link
                      href={`/stock/${item.ticker}`}
                      onClick={() => setOpen(false)}
                      className="min-w-0 flex-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-foreground">{item.ticker}</span>
                        {q ? (
                          <span className="font-bold text-foreground tabular-nums">
                            {formatCurrency(q.price)}
                          </span>
                        ) : loadingPrices ? (
                          <span className="h-4 w-16 animate-pulse rounded bg-muted" />
                        ) : null}
                      </div>

                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <span className="truncate text-sm text-muted-foreground">{item.name}</span>
                        {q ? (
                          <span
                            className={`flex shrink-0 items-center gap-0.5 text-xs font-medium ${
                              positive ? "text-green-500" : "text-red-500"
                            }`}
                          >
                            {positive
                              ? <ArrowUpRight className="h-3 w-3" />
                              : <ArrowDownRight className="h-3 w-3" />}
                            {positive ? "+" : ""}{q.change_pct?.toFixed(2)}%
                          </span>
                        ) : null}
                      </div>

                      {q?.post_market_price && (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          After hrs:{" "}
                          <span className="font-medium text-foreground">
                            {formatCurrency(q.post_market_price)}
                          </span>
                          {q.post_market_change_pct != null && (
                            <span
                              className={`ml-1 font-medium ${
                                (q.post_market_change_pct ?? 0) >= 0 ? "text-green-500" : "text-red-500"
                              }`}
                            >
                              {(q.post_market_change_pct ?? 0) >= 0 ? "+" : ""}
                              {q.post_market_change_pct?.toFixed(2)}%
                            </span>
                          )}
                        </div>
                      )}
                    </Link>

                    {/* Remove */}
                    <button
                      onClick={() => remove(item.ticker)}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                      aria-label={`Remove ${item.ticker}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="border-t border-border bg-card p-4 space-y-2">
            <button
              onClick={goToPortfolio}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <TrendingUp className="h-4 w-4" />
              {selected.size > 0
                ? `Build Portfolio (${selected.size} selected)`
                : `Build Portfolio with All (${items.length})`}
            </button>

            <button
              onClick={clear}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear All
            </button>
          </div>
        )}
      </div>
    </>
  );
}
