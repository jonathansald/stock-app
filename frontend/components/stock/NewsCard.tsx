"use client";

import type { NewsArticle } from "@/lib/types";
import { timeAgo } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";

interface Props {
  article: NewsArticle;
}

function sentimentVariant(sentiment?: string) {
  if (!sentiment) return "secondary";
  if (sentiment === "positive") return "success";
  if (sentiment === "negative") return "destructive";
  return "secondary";
}

export function NewsCard({ article }: Props) {
  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex gap-4 rounded-lg border bg-card p-4 transition-colors hover:bg-muted/30"
    >
      {article.image && (
        <img
          src={article.image}
          alt=""
          className="h-16 w-24 shrink-0 rounded object-cover"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium leading-tight line-clamp-2">{article.headline}</p>
          <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        </div>
        <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{article.summary}</p>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{article.source}</span>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="text-xs text-muted-foreground">{timeAgo(article.published_at)}</span>
          {article.sentiment && (
            <Badge variant={sentimentVariant(article.sentiment)} className="text-xs">
              {article.sentiment}
            </Badge>
          )}
        </div>
      </div>
    </a>
  );
}
