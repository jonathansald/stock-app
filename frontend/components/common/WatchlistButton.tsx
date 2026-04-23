"use client";

import { Bookmark, BookmarkCheck } from "lucide-react";
import { useWatchlist } from "@/components/providers/WatchlistProvider";
import { cn } from "@/lib/utils";

interface Props {
  ticker: string;
  name: string;
  className?: string;
  size?: "sm" | "md";
}

export function WatchlistButton({ ticker, name, className, size = "md" }: Props) {
  const { has, toggle } = useWatchlist();
  const saved = has(ticker);

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(ticker, name);
      }}
      aria-label={saved ? `Remove ${ticker} from watchlist` : `Add ${ticker} to watchlist`}
      className={cn(
        "flex items-center justify-center rounded-md border transition-colors",
        size === "sm"
          ? "h-7 w-7 text-xs"
          : "h-9 w-9",
        saved
          ? "border-primary bg-primary/10 text-primary hover:bg-primary/20"
          : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
        className
      )}
    >
      {saved ? (
        <BookmarkCheck className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
      ) : (
        <Bookmark className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
      )}
    </button>
  );
}
