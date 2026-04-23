"use client";

import Image from "next/image";
import type { Quote, CompanyProfile } from "@/lib/types";
import { formatCurrency, formatLargeNumber } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
import { WatchlistButton } from "@/components/common/WatchlistButton";
import { ExternalLink } from "lucide-react";

interface Props {
  quote: Quote;
  profile: CompanyProfile;
}

export function StockHeader({ quote, profile }: Props) {
  const isPositive = (quote.change_pct ?? 0) >= 0;

  const extendedPrice = quote.post_market_price || quote.pre_market_price;
  const extendedChange = quote.post_market_change || quote.pre_market_change;
  const extendedChangePct = quote.post_market_change_pct || quote.pre_market_change_pct;
  const extendedLabel = quote.post_market_price ? "After Hours" : quote.pre_market_price ? "Pre-Market" : null;
  const extendedPositive = (extendedChangePct ?? 0) >= 0;

  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="flex flex-wrap items-start gap-4">
        {profile.logo && (
          <Image
            src={profile.logo}
            alt={profile.name}
            width={56}
            height={56}
            className="rounded-lg border object-contain"
            unoptimized
          />
        )}
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{profile.name}</h1>
            <Badge variant="outline">{quote.ticker}</Badge>
            <Badge variant="secondary">{profile.exchange}</Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            {profile.sector && <span>{profile.sector}</span>}
            {profile.industry && <span>· {profile.industry}</span>}
            {profile.website && (
              <a href={profile.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-foreground">
                Website <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="text-right">
            <div className="text-3xl font-bold">{formatCurrency(quote.price)}</div>
            <div className={`mt-0.5 text-sm font-medium ${isPositive ? "text-green-600" : "text-red-600"}`}>
              {isPositive ? "+" : ""}{quote.change?.toFixed(2)} ({isPositive ? "+" : ""}{quote.change_pct?.toFixed(2)}%)
            </div>
            {extendedPrice && extendedLabel && (
              <div className="mt-1.5 rounded bg-muted px-2 py-1 text-xs">
                <span className="text-muted-foreground">{extendedLabel}: </span>
                <span className="font-semibold">{formatCurrency(extendedPrice)}</span>
                {extendedChangePct != null && (
                  <span className={`ml-1 font-medium ${extendedPositive ? "text-green-600" : "text-red-600"}`}>
                    {extendedPositive ? "+" : ""}{extendedChange?.toFixed(2)} ({extendedPositive ? "+" : ""}{extendedChangePct?.toFixed(2)}%)
                  </span>
                )}
              </div>
            )}
          </div>
          <WatchlistButton ticker={quote.ticker} name={profile.name} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 sm:grid-cols-4 lg:grid-cols-6">
        <Stat label="Market Cap" value={formatLargeNumber(profile.market_cap)} />
        <Stat label="52W High" value={formatCurrency(profile["52w_high"])} />
        <Stat label="52W Low" value={formatCurrency(profile["52w_low"])} />
        <Stat label="Open" value={formatCurrency(quote.open)} />
        <Stat label="Day High" value={formatCurrency(quote.high)} />
        <Stat label="Day Low" value={formatCurrency(quote.low)} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
