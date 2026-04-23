"use client";

import { useEffect, useState, useCallback } from "react";
import { getMarketOverview, getAIMarketSummary, getMarketNews } from "@/lib/api";
import type { MarketOverview, AIMarketSummary, NewsArticle, MarketItem } from "@/lib/types";
import {
  TrendingUp, TrendingDown, RefreshCw, Bot,
  Zap, BarChart3, Globe, Bitcoin, Activity,
  Newspaper, AlertCircle, ChevronRight,
} from "lucide-react";
import { NewsCard } from "@/components/stock/NewsCard";
import {
  MarketInstrumentModal,
  type MarketInstrumentInfo,
} from "@/components/markets/MarketInstrumentModal";

// ── Helpers ──────────────────────────────────────────────────────────────────

function pct(v: number | null | undefined) {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function fmtPrice(v: number | null, isRate?: boolean, crypto = false) {
  if (v == null) return "—";
  if (isRate) return `${v.toFixed(3)}%`;
  if (crypto && v >= 1000) return `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (v >= 1000) return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v.toFixed(v < 1 ? 4 : 2);
}

function changeColor(v: number | null | undefined) {
  if (v == null) return "text-muted-foreground";
  return v >= 0 ? "text-green-500" : "text-red-500";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function IndexHero({
  item,
  onClick,
}: {
  item: MarketItem & { category?: string };
  onClick: () => void;
}) {
  const up = (item.change_pct ?? 0) >= 0;
  const isVix = item.symbol === "^VIX";
  const effectiveUp = isVix ? !up : up;

  return (
    <button
      onClick={onClick}
      className={`w-full rounded-xl border bg-card p-4 flex flex-col gap-1 text-left transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer group ${
        effectiveUp ? "border-green-500/20 hover:border-green-500/40" : "border-red-500/20 hover:border-red-500/40"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{item.name}</span>
        <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <span className="text-2xl font-bold tabular-nums">
        {item.symbol === "^VIX" ? (item.price?.toFixed(2) ?? "—") : fmtPrice(item.price)}
      </span>
      {item.change_pct != null && (
        <span className={`flex items-center gap-0.5 text-xs font-bold ${changeColor(effectiveUp ? 1 : -1)}`}>
          {effectiveUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {pct(item.change_pct)}
        </span>
      )}
    </button>
  );
}

function MarketRow({
  item,
  priceDecimals,
  onClick,
}: {
  item: MarketItem;
  priceDecimals?: number;
  onClick: () => void;
}) {
  const up = (item.change_pct ?? 0) >= 0;
  const color = changeColor(item.change_pct);
  const isCrypto = item.symbol.endsWith("-USD");
  const priceStr = item.is_rate
    ? `${item.price?.toFixed(3) ?? "—"}%`
    : fmtPrice(item.price, false, isCrypto);

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between py-2.5 border-b last:border-0 hover:bg-muted/30 -mx-1 px-1 rounded transition-colors group cursor-pointer text-left"
    >
      <div>
        <p className="text-sm font-semibold group-hover:text-primary transition-colors">{item.name}</p>
        <p className="text-xs text-muted-foreground font-mono">{item.symbol}</p>
      </div>
      <div className="flex items-center gap-2">
        <div className="text-right">
          <p className="text-sm font-bold tabular-nums">{priceStr}</p>
          <p className={`text-xs font-medium tabular-nums ${color}`}>
            {item.change_pct != null ? (
              <span className="flex items-center justify-end gap-0.5">
                {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {pct(item.change_pct)}
              </span>
            ) : "—"}
          </p>
        </div>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </button>
  );
}

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h2 className="font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MarketsPage() {
  const [overview, setOverview] = useState<MarketOverview | null>(null);
  const [aiSummary, setAiSummary] = useState<AIMarketSummary | null>(null);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [selectedInstrument, setSelectedInstrument] = useState<MarketInstrumentInfo | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [ov, summary, mNews] = await Promise.all([
        getMarketOverview().catch(() => null),
        getAIMarketSummary().catch(() => null),
        getMarketNews().catch(() => ({ articles: [] })),
      ]);
      if (ov) setOverview(ov);
      if (summary) setAiSummary(summary);
      setNews(mNews.articles.slice(0, 8));
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const refreshAI = useCallback(async () => {
    setAiLoading(true);
    try { setAiSummary(await getAIMarketSummary()); } finally { setAiLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const id = setInterval(() => load(true), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  const openInstrument = (item: MarketItem, category: string) => {
    setSelectedInstrument({
      symbol:     item.symbol,
      name:       item.name,
      price:      item.price,
      change:     item.change,
      change_pct: item.change_pct,
      is_rate:    item.is_rate,
      category,
    });
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="flex items-center gap-2 mb-6">
          <Activity className="h-5 w-5 text-primary animate-pulse" />
          <h1 className="text-2xl font-bold">Markets</h1>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 mb-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl border bg-muted/30 animate-pulse" />
          ))}
        </div>
        <div className="h-28 rounded-xl border bg-muted/30 animate-pulse mb-6" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-64 rounded-xl border bg-muted/30 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const indexes     = overview?.indexes     ?? [];
  const commodities = overview?.commodities ?? [];
  const rates       = overview?.rates       ?? [];
  const crypto      = overview?.crypto      ?? [];
  const forex       = overview?.forex       ?? [];

  const now = lastUpdated
    ? lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <>
      <div className="mx-auto max-w-7xl px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              <h1 className="text-2xl font-bold">Markets</h1>
            </div>
            {now && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Prices as of {now} · Click any instrument to see the full chart · Auto-updates every 5 min
              </p>
            )}
          </div>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-lg border bg-background px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Major Indexes */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {indexes.map((item) => (
            <IndexHero key={item.symbol} item={{ ...item, category: "indexes" }}
              onClick={() => openInstrument(item, "indexes")} />
          ))}
        </div>

        {/* AI Market Brief */}
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold">AI Market Brief</h2>
                <p className="text-xs text-muted-foreground">Powered by Claude — updated hourly</p>
              </div>
            </div>
            <button
              onClick={refreshAI}
              disabled={aiLoading}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${aiLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {aiLoading ? (
            <div className="space-y-2">
              {[null, "4/5", "3/5"].map((w, i) => (
                <div key={i} className={`h-4 rounded bg-muted/60 animate-pulse ${w ? `w-${w}` : "w-full"}`} />
              ))}
            </div>
          ) : aiSummary?.summary ? (
            <div>
              <p className="text-sm leading-relaxed">{aiSummary.summary}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                AI-generated from today&apos;s headlines + index data. Not financial advice.
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-lg bg-muted/40 p-3">
              <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground">
                {aiSummary?.error ?? "AI summary unavailable."}
              </p>
            </div>
          )}
        </div>

        {/* Four-column grid */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">

          <SectionCard title="Commodities" icon={<Zap className="h-4 w-4 text-yellow-500" />}>
            {commodities.map((item) => (
              <MarketRow key={item.symbol} item={item} priceDecimals={2}
                onClick={() => openInstrument(item, "commodities")} />
            ))}
          </SectionCard>

          <SectionCard title="US Treasury Yields" icon={<BarChart3 className="h-4 w-4 text-blue-500" />}>
            {rates.map((item) => (
              <MarketRow key={item.symbol} item={item}
                onClick={() => openInstrument(item, "rates")} />
            ))}
            <div className="mt-3 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Rising yields can pressure growth stocks and signal tighter monetary policy.
            </div>
          </SectionCard>

          <SectionCard title="Crypto" icon={<Bitcoin className="h-4 w-4 text-orange-400" />}>
            {crypto.map((item) => (
              <MarketRow key={item.symbol} item={item} priceDecimals={2}
                onClick={() => openInstrument(item, "crypto")} />
            ))}
          </SectionCard>

          <SectionCard title="Forex" icon={<Globe className="h-4 w-4 text-emerald-500" />}>
            {forex.map((item) => (
              <MarketRow key={item.symbol} item={item} priceDecimals={4}
                onClick={() => openInstrument(item, "forex")} />
            ))}
          </SectionCard>

        </div>

        {/* Market News */}
        {news.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Newspaper className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold">Market News</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {news.map((article, i) => (
                <NewsCard key={i} article={article} />
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center pb-4">
          Prices delayed. Not financial advice.
        </p>
      </div>

      {/* Instrument chart modal */}
      <MarketInstrumentModal
        instrument={selectedInstrument}
        onClose={() => setSelectedInstrument(null)}
      />
    </>
  );
}
