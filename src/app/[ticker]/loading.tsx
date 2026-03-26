export default function TickerLoading() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Summary skeleton */}
      <div className="border-b p-6 space-y-4">
        <div className="h-4 w-40 bg-muted rounded" />
        <div className="h-10 w-32 bg-muted rounded" />
        <div className="h-3 w-64 bg-muted rounded" />
        <div className="h-40 bg-muted rounded" />
      </div>

      {/* Chart skeleton */}
      <div className="border-b p-6">
        <div className="h-5 w-56 bg-muted rounded mb-4" />
        <div className="h-48 bg-muted rounded" />
      </div>

      {/* Cards grid skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="border-b p-4 space-y-2">
            <div className="h-4 w-32 bg-muted rounded" />
            <div className="h-6 w-20 bg-muted rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
