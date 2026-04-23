export interface Quote {
  ticker: string;
  price: number;
  change: number;
  change_pct: number;
  high: number;
  low: number;
  open: number;
  prev_close: number;
  volume: number;
  pre_market_price?: number | null;
  pre_market_change?: number | null;
  pre_market_change_pct?: number | null;
  post_market_price?: number | null;
  post_market_change?: number | null;
  post_market_change_pct?: number | null;
  has_pre_post_data?: boolean;
}

export interface CompanyProfile {
  ticker: string;
  name: string;
  exchange: string;
  sector: string;
  industry: string;
  country: string;
  currency: string;
  logo: string;
  website: string;
  market_cap: number;
  shares_outstanding: number;
  ipo_date: string;
  description: string;
  employees: number;
  "52w_high": number;
  "52w_low": number;
  avg_volume: number;
}

export interface KeyMetrics {
  pe_ratio: number | null;
  forward_pe: number | null;
  pb_ratio: number | null;
  ps_ratio: number | null;
  ev_ebitda: number | null;
  roe: number | null;
  roa: number | null;
  debt_to_equity: number | null;
  current_ratio: number | null;
  dividend_yield: number | null;
  earnings_yield: number | null;
  free_cash_flow_yield: number | null;
  revenue_per_share: number | null;
  net_income_per_share: number | null;
}

export interface HistoricalPrice {
  date: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface AnalystData {
  recommendation_trends: {
    period: string;
    strong_buy: number;
    buy: number;
    hold: number;
    sell: number;
    strong_sell: number;
  };
  price_targets: {
    target_high: number;
    target_low: number;
    target_consensus: number;
    target_median: number;
  };
  estimates: AnalystEstimate[];
}

export interface AnalystEstimate {
  date: string;
  estimated_revenue: number;
  estimated_eps: number;
  estimated_eps_high: number;
  estimated_eps_low: number;
}

export interface IncomeStatement {
  date: string;
  period: string;
  revenue: number;
  gross_profit: number;
  gross_margin: number;
  operating_income: number;
  operating_margin: number;
  net_income: number;
  net_margin: number;
  ebitda: number;
  eps: number;
  eps_diluted: number;
  shares_outstanding: number;
  rd_expenses: number;
  sga_expenses: number;
}

export interface BalanceSheet {
  date: string;
  period: string;
  cash: number;
  total_current_assets: number;
  total_assets: number;
  total_current_liabilities: number;
  total_liabilities: number;
  total_equity: number;
  total_debt: number;
  net_debt: number;
  goodwill: number;
  retained_earnings: number;
}

export interface CashFlow {
  date: string;
  period: string;
  operating_cash_flow: number;
  investing_cash_flow: number;
  financing_cash_flow: number;
  free_cash_flow: number;
  capex: number;
  dividends_paid: number;
  stock_repurchases: number;
  depreciation: number;
}

export interface ScreenerStock {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  price: number;
  market_cap: number;
  beta: number;
  volume: number;
  exchange: string;
  country: string;
}

export interface PortfolioOptimizeRequest {
  tickers: string[];
  risk_profile: "conservative" | "moderate" | "aggressive";
  period: string;
  min_weight?: number;
  max_weight?: number;
}

export interface FrontierPoint {
  return: number;
  volatility: number;
  sharpe: number;
  weights: Record<string, number>;
}

export interface PortfolioResult {
  weights: Record<string, number>;
  expected_return: number;
  volatility: number;
  sharpe_ratio: number;
  frontier_points: FrontierPoint[];
  portfolio_history: { date: string; portfolio: number; benchmark: number }[];
  tickers_used: string[];
}

export interface DCFPrefill {
  ticker: string;
  revenue_growth_suggestion: number;
  ebit_margin_suggestion: number;
  da_pct_suggestion: number;
  capex_pct_suggestion: number;
  tax_rate_suggestion?: number;
  wacc_suggestion?: number;
  tgr_suggestion?: number;
  analyst_target?: number | null;
  current_revenue: number;
  shares_outstanding: number;
  net_debt: number;
  historical_revenues: { date: string; revenue: number }[];
  historical_growth_rates: number[];
}

export interface DCFResult {
  projections: { year: number; revenue: number; ebit: number; fcf: number; pv_fcf: number }[];
  pv_fcf_sum: number;
  terminal_value: number;
  pv_terminal_value: number;
  enterprise_value: number;
  equity_value: number;
  intrinsic_value_per_share: number;
  ticker: string;
  current_price: number | null;
  margin_of_safety: number | null;
  sensitivity_table: Record<string, Record<string, number>>;
  wacc_range: number[];
  tgr_range: number[];
}

export interface ComparableCompany {
  symbol: string;
  name?: string;
  sector?: string;
  industry?: string;
  price?: number | null;
  market_cap?: number | null;
  pe_ratio?: number | null;
  pb_ratio?: number | null;
  ps_ratio?: number | null;
  ev_ebitda?: number | null;
  ev_sales?: number | null;
  roe?: number | null;
  eps?: number | null;
  revenue_per_share?: number | null;
  book_value_per_share?: number | null;
  dividend_yield?: number | null;
  beta?: number | null;
}

export interface ImpliedPrice {
  multiple_name: string;
  multiple: number;
  metric_label: string;
  metric_value: number;
  implied_price: number;
  upside_pct: number | null;
}

export interface ComparablesResult {
  target: ComparableCompany;
  peers: ComparableCompany[];
  peer_medians: {
    pe: number | null;
    pb: number | null;
    ps: number | null;
    ev_ebitda: number | null;
    ev_sales: number | null;
  };
  implied_prices: {
    pe?: ImpliedPrice;
    ps?: ImpliedPrice;
    pb?: ImpliedPrice;
  };
  composite_implied: number | null;
  current_price: number | null;
}

export interface NewsArticle {
  headline: string;
  summary: string;
  source: string;
  url: string;
  image: string;
  published_at: number | string;
  sentiment?: string;
}

export interface SymbolSearchResult {
  ticker: string;
  name: string;
  type: string;
}

export interface MarketItem {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  change_pct: number | null;
  is_rate?: boolean;
}

export interface MarketOverview {
  indexes: MarketItem[];
  commodities: MarketItem[];
  rates: MarketItem[];
  crypto: MarketItem[];
  forex: MarketItem[];
}

export interface AIMarketSummary {
  summary: string | null;
  error: string | null;
  headlines_used?: boolean;
}
