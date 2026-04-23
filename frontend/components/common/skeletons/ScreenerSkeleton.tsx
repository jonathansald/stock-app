import { Skeleton } from "@/components/ui/skeleton";

export function ScreenerSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border">
      {/* Header row */}
      <div className="border-b bg-muted/50 px-4 py-3">
        <div className="grid grid-cols-7 gap-4">
          {["w-12", "w-32", "w-24", "w-16", "w-20", "w-10", "w-16"].map((w, i) => (
            <Skeleton key={i} className={`h-3 ${w}`} />
          ))}
        </div>
      </div>

      {/* Data rows */}
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className="grid grid-cols-7 items-center gap-4 border-b px-4 py-3.5 last:border-0"
        >
          <Skeleton className="h-4 w-12 rounded" />
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-8" />
          <Skeleton className="h-4 w-12" />
        </div>
      ))}
    </div>
  );
}
