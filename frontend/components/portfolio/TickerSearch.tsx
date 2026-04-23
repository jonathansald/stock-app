"use client";

import { useState, useEffect, useRef } from "react";
import { searchSymbols } from "@/lib/api";
import type { SymbolSearchResult } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

interface Props {
  onSelect: (result: SymbolSearchResult) => void;
  disabled?: boolean;
}

const POPULAR_STOCKS: SymbolSearchResult[] = [
  { ticker: "AAPL",  name: "Apple Inc.",                       type: "Common Stock" },
  { ticker: "MSFT",  name: "Microsoft Corporation",            type: "Common Stock" },
  { ticker: "GOOGL", name: "Alphabet Inc. (Google)",           type: "Common Stock" },
  { ticker: "AMZN",  name: "Amazon.com Inc.",                  type: "Common Stock" },
  { ticker: "NVDA",  name: "NVIDIA Corporation",               type: "Common Stock" },
  { ticker: "META",  name: "Meta Platforms Inc.",              type: "Common Stock" },
  { ticker: "TSLA",  name: "Tesla Inc.",                       type: "Common Stock" },
  { ticker: "BRK.B", name: "Berkshire Hathaway Inc.",          type: "Common Stock" },
  { ticker: "JPM",   name: "JPMorgan Chase & Co.",             type: "Common Stock" },
  { ticker: "V",     name: "Visa Inc.",                        type: "Common Stock" },
  { ticker: "JNJ",   name: "Johnson & Johnson",                type: "Common Stock" },
  { ticker: "WMT",   name: "Walmart Inc.",                     type: "Common Stock" },
  { ticker: "PG",    name: "Procter & Gamble Co.",             type: "Common Stock" },
  { ticker: "MA",    name: "Mastercard Inc.",                  type: "Common Stock" },
  { ticker: "UNH",   name: "UnitedHealth Group Inc.",          type: "Common Stock" },
  { ticker: "HD",    name: "Home Depot Inc.",                  type: "Common Stock" },
  { ticker: "BAC",   name: "Bank of America Corp.",            type: "Common Stock" },
  { ticker: "XOM",   name: "Exxon Mobil Corporation",          type: "Common Stock" },
  { ticker: "CVX",   name: "Chevron Corporation",              type: "Common Stock" },
  { ticker: "ABBV",  name: "AbbVie Inc.",                      type: "Common Stock" },
  { ticker: "KO",    name: "The Coca-Cola Company",            type: "Common Stock" },
  { ticker: "PEP",   name: "PepsiCo Inc.",                     type: "Common Stock" },
  { ticker: "AVGO",  name: "Broadcom Inc.",                    type: "Common Stock" },
  { ticker: "COST",  name: "Costco Wholesale Corporation",     type: "Common Stock" },
  { ticker: "MRK",   name: "Merck & Co. Inc.",                 type: "Common Stock" },
  { ticker: "AMD",   name: "Advanced Micro Devices Inc.",      type: "Common Stock" },
  { ticker: "NFLX",  name: "Netflix Inc.",                     type: "Common Stock" },
  { ticker: "ADBE",  name: "Adobe Inc.",                       type: "Common Stock" },
  { ticker: "CRM",   name: "Salesforce Inc.",                  type: "Common Stock" },
  { ticker: "TMO",   name: "Thermo Fisher Scientific Inc.",    type: "Common Stock" },
  { ticker: "ACN",   name: "Accenture plc",                    type: "Common Stock" },
  { ticker: "NKE",   name: "Nike Inc.",                        type: "Common Stock" },
  { ticker: "LIN",   name: "Linde plc",                        type: "Common Stock" },
  { ticker: "ORCL",  name: "Oracle Corporation",               type: "Common Stock" },
  { ticker: "TXN",   name: "Texas Instruments Inc.",           type: "Common Stock" },
  { ticker: "QCOM",  name: "Qualcomm Inc.",                    type: "Common Stock" },
  { ticker: "INTC",  name: "Intel Corporation",                type: "Common Stock" },
  { ticker: "CSCO",  name: "Cisco Systems Inc.",               type: "Common Stock" },
  { ticker: "IBM",   name: "International Business Machines",  type: "Common Stock" },
  { ticker: "GS",    name: "Goldman Sachs Group Inc.",         type: "Common Stock" },
  { ticker: "MS",    name: "Morgan Stanley",                   type: "Common Stock" },
  { ticker: "WFC",   name: "Wells Fargo & Company",            type: "Common Stock" },
  { ticker: "PYPL",  name: "PayPal Holdings Inc.",             type: "Common Stock" },
  { ticker: "UBER",  name: "Uber Technologies Inc.",           type: "Common Stock" },
  { ticker: "ABNB",  name: "Airbnb Inc.",                      type: "Common Stock" },
  { ticker: "SPOT",  name: "Spotify Technology S.A.",          type: "Common Stock" },
  { ticker: "SQ",    name: "Block Inc. (Square)",              type: "Common Stock" },
  { ticker: "SHOP",  name: "Shopify Inc.",                     type: "Common Stock" },
  { ticker: "SNAP",  name: "Snap Inc.",                        type: "Common Stock" },
  { ticker: "DIS",   name: "The Walt Disney Company",          type: "Common Stock" },
  { ticker: "NDAQ",  name: "Nasdaq Inc.",                      type: "Common Stock" },
  { ticker: "SPY",   name: "SPDR S&P 500 ETF Trust",          type: "ETF" },
  { ticker: "QQQ",   name: "Invesco QQQ Trust (NASDAQ 100)",  type: "ETF" },
  { ticker: "VTI",   name: "Vanguard Total Stock Market ETF", type: "ETF" },
  { ticker: "VOO",   name: "Vanguard S&P 500 ETF",            type: "ETF" },
];

function searchLocal(query: string): SymbolSearchResult[] {
  const q = query.toUpperCase().trim();
  if (!q) return [];
  return POPULAR_STOCKS.filter(
    (s) => s.ticker.startsWith(q) || s.name.toUpperCase().includes(q)
  ).slice(0, 8);
}

export function TickerSearch({ onSelect, disabled }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SymbolSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }

    // Instant local suggestions
    const local = searchLocal(query);
    setResults(local);
    setOpen(local.length > 0);

    // Debounced API search to augment local results
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await searchSymbols(query);
        if (data.results.length > 0) {
          // Merge API results with local, deduplicating by ticker
          const seen = new Set(local.map((r) => r.ticker));
          const merged = [
            ...local,
            ...data.results.filter((r) => !seen.has(r.ticker)),
          ].slice(0, 10);
          setResults(merged);
          setOpen(true);
        }
      } catch {
        // API unavailable — local results are sufficient
      }
    }, 400);
  }, [query]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (result: SymbolSearchResult) => {
    onSelect(result);
    setQuery("");
    setResults([]);
    setOpen(false);
  };

  const addDirect = () => {
    const ticker = query.trim().toUpperCase();
    if (!ticker) return;
    const known = POPULAR_STOCKS.find((s) => s.ticker === ticker);
    onSelect(known ?? { ticker, name: ticker, type: "Common Stock" });
    setQuery("");
    setResults([]);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (open && results.length > 0) {
        handleSelect(results[0]);
      } else {
        addDirect();
      }
    }
    if (e.key === "Escape") setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value.toUpperCase())}
          onKeyDown={handleKeyDown}
          onFocus={() => query.trim() && results.length > 0 && setOpen(true)}
          placeholder="Search ticker or company name…"
          className="pl-9 pr-16"
          disabled={disabled}
          autoComplete="off"
        />
        {query.trim() && (
          <button
            type="button"
            onClick={addDirect}
            disabled={disabled}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
          >
            Add
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
          {results.map((r, i) => (
            <button
              key={r.ticker}
              className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent ${i > 0 ? "border-t border-border/50" : ""}`}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(r); }}
            >
              <span className="w-14 shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-center text-xs font-bold text-primary">
                {r.ticker}
              </span>
              <span className="flex-1 truncate text-sm text-foreground/80">{r.name}</span>
              {r.type === "ETF" && (
                <span className="ml-auto shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                  ETF
                </span>
              )}
            </button>
          ))}
          <div className="border-t border-border/50 px-3 py-1.5 text-[11px] text-muted-foreground">
            Press Enter to add top result · Esc to close
          </div>
        </div>
      )}
    </div>
  );
}
