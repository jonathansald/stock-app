"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@radix-ui/react-label";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

export interface ScreenerFilters {
  sector: string;
  industry: string;
  market_cap_more_than: string;
  market_cap_less_than: string;
  price_more_than: string;
  price_less_than: string;
  beta_less_than: string;
  dividend_more_than: string;
  analyst_recommendation: string;
  min_target_upside: string;
}

interface Props {
  filters: ScreenerFilters;
  onChange: (filters: ScreenerFilters) => void;
  onSearch: () => void;
  sectors: string[];
  industries: Record<string, string[]>;
  loading: boolean;
}

export function resolveFilter(value: string): string {
  return value;
}

const MARKET_CAP_OPTIONS = [
  { label: "Any size", value: "" },
  { label: "Mega Cap (>$200B)", value: "200000000000" },
  { label: "Large Cap (>$10B)", value: "10000000000" },
  { label: "Mid Cap (>$2B)", value: "2000000000" },
  { label: "Small Cap (>$300M)", value: "300000000" },
  { label: "Micro Cap (>$50M)", value: "50000000" },
];

const ANALYST_REC_OPTIONS = [
  { label: "Any recommendation", value: "" },
  { label: "Strong Buy", value: "Strong Buy" },
  { label: "Buy or better", value: "Buy" },
  { label: "Neutral or better", value: "Neutral" },
  { label: "Sell or better", value: "Sell" },
];

function NativeSelect({
  value,
  onChange,
  disabled,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="h-9 w-full appearance-none rounded-md border border-input bg-background pl-3 pr-8 py-1.5 text-sm text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        {children}
      </select>
      <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
        <ChevronDown className="h-4 w-4" />
      </div>
    </div>
  );
}

export function ScreenerFiltersPanel({ filters, onChange, onSearch, sectors, industries, loading }: Props) {
  const set = (key: keyof ScreenerFilters, value: string) => onChange({ ...filters, [key]: value });

  const sectorIndustries = filters.sector ? (industries[filters.sector] ?? []) : [];

  return (
    <div className="space-y-4 rounded-lg border bg-card p-5">
      <h2 className="font-semibold text-foreground">Filter Stocks</h2>

      {/* Sector */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Sector</Label>
        <NativeSelect
          value={filters.sector}
          onChange={(v) => onChange({ ...filters, sector: v, industry: "" })}
        >
          <option value="">All Sectors</option>
          {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
        </NativeSelect>
      </div>

      {/* Industry — always shown, disabled when no sector */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Industry</Label>
        <NativeSelect
          value={filters.industry}
          onChange={(v) => set("industry", v)}
          disabled={sectorIndustries.length === 0}
        >
          <option value="">All Industries</option>
          {sectorIndustries.map((i) => <option key={i} value={i}>{i}</option>)}
        </NativeSelect>
      </div>

      {/* Market Cap */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Market Cap (Min)</Label>
        <NativeSelect
          value={filters.market_cap_more_than}
          onChange={(v) => set("market_cap_more_than", v)}
        >
          {MARKET_CAP_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </NativeSelect>
      </div>

      {/* Price range */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Price Min ($)</Label>
          <Input
            type="number"
            placeholder="0"
            value={filters.price_more_than}
            onChange={(e) => set("price_more_than", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Price Max ($)</Label>
          <Input
            type="number"
            placeholder="Any"
            value={filters.price_less_than}
            onChange={(e) => set("price_less_than", e.target.value)}
          />
        </div>
      </div>

      {/* Beta + Dividend */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Max Beta</Label>
          <Input
            type="number"
            placeholder="Any"
            step="0.1"
            value={filters.beta_less_than}
            onChange={(e) => set("beta_less_than", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Min Dividend (%)</Label>
          <Input
            type="number"
            placeholder="0"
            step="0.1"
            value={filters.dividend_more_than}
            onChange={(e) => set("dividend_more_than", e.target.value)}
          />
        </div>
      </div>

      {/* Analyst filters */}
      <div className="border-t pt-4 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Analyst Filters</p>

        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Analyst Recommendation</Label>
          <NativeSelect
            value={filters.analyst_recommendation}
            onChange={(v) => set("analyst_recommendation", v)}
          >
            {ANALYST_REC_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </NativeSelect>
          {filters.analyst_recommendation && (
            <p className="text-xs text-muted-foreground">Applied after results load</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Min Target Upside (%)</Label>
          <Input
            type="number"
            placeholder="e.g. 10"
            step="1"
            value={filters.min_target_upside}
            onChange={(e) => set("min_target_upside", e.target.value)}
          />
          {filters.min_target_upside && (
            <p className="text-xs text-muted-foreground">Applied after results load</p>
          )}
        </div>
      </div>

      <Button className="w-full" onClick={onSearch} disabled={loading}>
        {loading ? "Searching..." : "Search Stocks"}
      </Button>
    </div>
  );
}
