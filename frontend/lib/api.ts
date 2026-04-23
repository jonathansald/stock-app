import type {
  Quote, CompanyProfile, KeyMetrics, HistoricalPrice,
  AnalystData, IncomeStatement, BalanceSheet, CashFlow,
  ScreenerStock, PortfolioOptimizeRequest, PortfolioResult,
  DCFPrefill, DCFResult, ComparablesResult, NewsArticle, SymbolSearchResult,
  MarketOverview, AIMarketSummary,
} from "./types";

// Empty string = use relative URLs (proxied through Next.js to localhost:8000).
// Set NEXT_PUBLIC_API_URL to point directly to a remote backend in production.
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";

async function fetcher<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json();
}

async function poster<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `API error ${res.status}`);
  }
  return res.json();
}

// Screener
export const getScreenerStocks = (params: Record<string, string | number | null>) => {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== "") query.set(k, String(v));
  }
  return fetcher<{ stocks: ScreenerStock[]; count: number }>(`/api/screener/stocks?${query}`);
};

export const getSectors = () =>
  fetcher<{ sectors: string[]; industries: Record<string, string[]> }>("/api/screener/sectors");

export const searchSymbols = (q: string) =>
  fetcher<{ results: SymbolSearchResult[] }>(`/api/screener/search?q=${encodeURIComponent(q)}`);

// Stocks
export const getQuote = (ticker: string) =>
  fetcher<Quote>(`/api/stocks/${ticker}/quote`);

export const getProfile = (ticker: string) =>
  fetcher<CompanyProfile>(`/api/stocks/${ticker}/profile`);

export const getHistory = (ticker: string, period = "1y") =>
  fetcher<{ ticker: string; period: string; data: HistoricalPrice[] }>(
    `/api/stocks/${ticker}/history?period=${period}`
  );

export const getMetrics = (ticker: string) =>
  fetcher<KeyMetrics>(`/api/stocks/${ticker}/metrics`);

export const getAnalyst = (ticker: string) =>
  fetcher<AnalystData>(`/api/stocks/${ticker}/analyst`);

// Financials
export const getIncome = (ticker: string, period = "annual") =>
  fetcher<{ ticker: string; period: string; data: IncomeStatement[] }>(
    `/api/financials/${ticker}/income?period=${period}&limit=5`
  );

export const getBalance = (ticker: string, period = "annual") =>
  fetcher<{ ticker: string; period: string; data: BalanceSheet[] }>(
    `/api/financials/${ticker}/balance?period=${period}&limit=5`
  );

export const getCashFlow = (ticker: string, period = "annual") =>
  fetcher<{ ticker: string; period: string; data: CashFlow[] }>(
    `/api/financials/${ticker}/cashflow?period=${period}&limit=5`
  );

// Portfolio
export const optimizePortfolio = (req: PortfolioOptimizeRequest) =>
  poster<PortfolioResult>("/api/portfolio/optimize", req);

export const getCorrelation = (tickers: string[], period = "1y") =>
  fetcher<{ tickers: string[]; matrix: number[][] }>(
    `/api/portfolio/correlation?tickers=${tickers.join(",")}&period=${period}`
  );

// DCF
export const getDCFPrefill = (ticker: string) =>
  fetcher<DCFPrefill>(`/api/dcf/${ticker}/prefill`);

export const calculateDCF = (ticker: string, params: Record<string, unknown>) =>
  poster<DCFResult>(`/api/dcf/${ticker}/calculate`, params);

export const getComparables = (ticker: string) =>
  fetcher<ComparablesResult>(`/api/dcf/${ticker}/comparables`);

// News
export const getCompanyNews = (ticker: string) =>
  fetcher<{ ticker: string; articles: NewsArticle[] }>(`/api/news/${ticker}`);

export const getMarketNews = () =>
  fetcher<{ articles: NewsArticle[] }>("/api/news/market");

// Market overview
export const getMarketOverview = () =>
  fetcher<MarketOverview>("/api/market/overview");

export const getAIMarketSummary = () =>
  fetcher<AIMarketSummary>("/api/market/ai-summary");

export const getMarketSymbolHistory = (symbol: string, period = "1y") =>
  fetcher<{ symbol: string; period: string; data: HistoricalPrice[] }>(
    `/api/market/history?symbol=${encodeURIComponent(symbol)}&period=${encodeURIComponent(period)}`,
  );

// Screener extras
export const getEarningsBatch = (tickers: string) =>
  fetcher<{ data: Record<string, string | null> }>(`/api/screener/earnings-batch?tickers=${encodeURIComponent(tickers)}`);
