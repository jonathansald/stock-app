import { Skeleton } from "@/components/ui/skeleton";

export function StockHeaderSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="flex items-start gap-4">
        <Skeleton className="h-14 w-14 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="space-y-2 text-right">
          <Skeleton className="h-9 w-28 ml-auto" />
          <Skeleton className="h-4 w-20 ml-auto" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-3 border-t pt-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PriceChartSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-5 w-28" />
        <div className="flex gap-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-10 rounded-md" />
          ))}
        </div>
      </div>
      <Skeleton className="h-64 w-full rounded-md" />
    </div>
  );
}

export function KeyMetricsSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-5">
      <Skeleton className="mb-4 h-5 w-28" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="rounded-md bg-muted/40 p-3 space-y-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}
