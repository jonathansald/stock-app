"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

interface WatchlistItem {
  ticker: string;
  name: string;
}

interface WatchlistContextValue {
  items: WatchlistItem[];
  add: (ticker: string, name: string) => void;
  remove: (ticker: string) => void;
  toggle: (ticker: string, name: string) => void;
  has: (ticker: string) => boolean;
  clear: () => void;
}

const WatchlistContext = createContext<WatchlistContextValue | null>(null);

const STORAGE_KEY = "stockwise_watchlist";

export function WatchlistProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<WatchlistItem[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setItems(JSON.parse(stored));
    } catch {
      // ignore parse errors
    }
  }, []);

  const persist = useCallback((next: WatchlistItem[]) => {
    setItems(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore quota errors
    }
  }, []);

  const add = useCallback(
    (ticker: string, name: string) => {
      setItems((prev) => {
        if (prev.some((i) => i.ticker === ticker)) return prev;
        const next = [...prev, { ticker, name }];
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
        return next;
      });
    },
    []
  );

  const remove = useCallback(
    (ticker: string) => {
      setItems((prev) => {
        const next = prev.filter((i) => i.ticker !== ticker);
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
        return next;
      });
    },
    []
  );

  const toggle = useCallback(
    (ticker: string, name: string) => {
      setItems((prev) => {
        const exists = prev.some((i) => i.ticker === ticker);
        const next = exists
          ? prev.filter((i) => i.ticker !== ticker)
          : [...prev, { ticker, name }];
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
        return next;
      });
    },
    []
  );

  const has = useCallback(
    (ticker: string) => items.some((i) => i.ticker === ticker),
    [items]
  );

  const clear = useCallback(() => {
    persist([]);
  }, [persist]);

  return (
    <WatchlistContext.Provider value={{ items, add, remove, toggle, has, clear }}>
      {children}
    </WatchlistContext.Provider>
  );
}

export function useWatchlist() {
  const ctx = useContext(WatchlistContext);
  if (!ctx) throw new Error("useWatchlist must be used inside WatchlistProvider");
  return ctx;
}
