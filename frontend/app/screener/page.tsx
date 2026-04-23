"use client";

import { useState, useCallback, useEffect } from "react";
import { ScreenerFiltersPanel, type ScreenerFilters } from "@/components/screener/ScreenerFilters";
import { ScreenerTable } from "@/components/screener/ScreenerTable";
import { ScreenerSkeleton } from "@/components/common/skeletons/ScreenerSkeleton";
import { getScreenerStocks, getSectors, getEarningsBatch } from "@/lib/api";
import type { ScreenerStock } from "@/lib/types";
import { BeginnerTip } from "@/components/common/BeginnerTip";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const DEFAULT_FILTERS: ScreenerFilters = {
  sector: "",
  industry: "",
  market_cap_more_than: "",
  market_cap_less_than: "",
  price_more_than: "",
  price_less_than: "",
  beta_less_than: "",
  dividend_more_than: "",
  analyst_recommendation: "",
  min_target_upside: "",
};

// Analyst recommendation ordering for "Buy or better" type filters
const REC_RANK: Record<string, number> = {
  "Strong Buy": 5,
  "Buy": 4,
  "Neutral": 3,
  "Sell": 2,
  "Strong Sell": 1,
};

interface AnalystData {
  recommendation?: string;
  target_consensus?: number;
}

export default function ScreenerPage() {
  const [filters, setFilters] = useState<ScreenerFilters>(DEFAULT_FILTERS);
  const [stocks, setStocks] = useState<ScreenerStock[]>([]);
  const [sectors, setSectors] = useState<string[]>([]);
  const [industries, setIndustries] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);
  const [analystLoading, setAnalystLoading] = useState(false);
  const [earningsLoading, setEarningsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [analystData, setAnalystData] = useState<Record<string, AnalystData>>({});
  const [earningsData, setEarningsData] = useState<Record<string, string | null>>({});
  // Selection persists across filter/search changes
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Keep name mapping so we can send correct names to portfolio
  const [selectedNames, setSelectedNames] = useState<Record<string, string>>({});

  useEffect(() => {
    getSectors().then((d) => {
      setSectors(d.sectors);
      setIndustries(d.industries);
    });
  }, []);

  const handleSearch = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAnalystData({});
    try {
      const params: Record<string, string | number | null> = {
        sector: filters.sector || null,
        industry: filters.industry || null,
        market_cap_more_than: filters.market_cap_more_than ? Number(filters.market_cap_more_than) : null,
        market_cap_less_than: filters.market_cap_less_than ? Number(filters.market_cap_less_than) : null,
        price_more_than: filters.price_more_than ? Number(filters.price_more_than) : null,
        price_less_than: filters.price_less_than ? Number(filters.price_less_than) : null,
        beta_less_than: filters.beta_less_than ? Number(filters.beta_less_than) : null,
        dividend_more_than: filters.dividend_more_than ? Number(filters.dividend_more_than) : null,
        limit: 50,
      };
      const data = await getScreenerStocks(params);
      setStocks(data.stocks);
      setSearched(true);
      setEarningsData({});

      if (data.stocks.length > 0) {
        const tickers = data.stocks.slice(0, 20).map((s) => s.ticker).join(",");

        // Always fetch earnings dates in background
        setEarningsLoading(true);
        getEarningsBatch(tickers)
          .then((res) => setEarningsData(res.data ?? {}))
          .catch(() => {})
          .finally(() => setEarningsLoading(false));

        // If analyst filters are set, auto-fetch analyst data in background
        if (filters.analyst_recommendation || filters.min_target_upside) {
          setAnalystLoading(true);
          fetch(`${BASE_URL}/api/screener/analyst-batch?tickers=${encodeURIComponent(tickers)}`)
            .then((r) => r.json())
            .then((result) => setAnalystData(result.data ?? {}))
            .catch(() => {})
            .finally(() => setAnalystLoading(false));
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Failed to load stocks: ${msg}. Make sure the backend is running and API keys are set.`);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Client-side analyst filtering
  const filteredStocks = stocks.filter((stock) => {
    const hasAnalystFilter = filters.analyst_recommendation || filters.min_target_upside;
    if (!hasAnalystFilter) return true;

    const ad = analystData[stock.ticker];
    if (!ad) return true; // don't hide if data not loaded yet

    if (filters.analyst_recommendation && ad.recommendation) {
      const minRank = REC_RANK[filters.analyst_recommendation] ?? 0;
      const stockRank = REC_RANK[ad.recommendation] ?? 0;
      if (stockRank < minRank) return false;
    }

    if (filters.min_target_upside && ad.target_consensus && stock.price) {
      const upside = ((ad.target_consensus - stock.price) / stock.price) * 100;
      if (upside < Number(filters.min_target_upside)) return false;
    }

    return true;
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Stock Screener</h1>
        <p className="text-muted-foreground">Filter stocks by sector, size, and financial metrics</p>
      </div>

      <BeginnerTip title="How to use the screener">
        Choose a sector you are interested in, set your preferred company size, and click Search. Click any stock to see
        detailed information. Add stocks you like to your portfolio using the Portfolio Builder.
      </BeginnerTip>

      <div className="mt-6 flex flex-col gap-6 lg:flex-row">
        <div className="w-full lg:w-72 lg:shrink-0">
          <ScreenerFiltersPanel
            filters={filters}
            onChange={setFilters}
            onSearch={handleSearch}
            sectors={sectors}
            industries={industries}
            loading={loading}
          />
        </div>

        <div className="flex-1 min-w-0">
          {loading && <ScreenerSkeleton />}
          {error && (
            <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
          )}
          {!loading && searched && (
            <>
              {(analystLoading || earningsLoading) && (
                <p className="mb-2 text-xs text-muted-foreground animate-pulse">
                  Loading {[analystLoading && "analyst", earningsLoading && "earnings"].filter(Boolean).join(" & ")} data…
                </p>
              )}
              <ScreenerTable
                stocks={filteredStocks}
                analystData={analystData}
                earningsData={earningsData}
                selected={selected}
                onSelectionChange={(next, names) => {
                  setSelected(next);
                  setSelectedNames((prev) => ({ ...prev, ...names }));
                }}
              />
            </>
          )}
          {!loading && !searched && (
            <div className="flex h-64 items-center justify-center rounded-lg border bg-muted/20 text-muted-foreground">
              Set your filters and click Search Stocks to get started
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
