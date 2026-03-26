export default function ValuationLoading() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Hero stats skeleton */}
      <div className="val-card">
        <div className="val-stats">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="h-3 w-20 bg-muted rounded" />
              <div className="h-7 w-28 bg-muted rounded" />
            </div>
          ))}
        </div>
        <div className="h-3 w-full max-w-xl bg-muted rounded mt-4" />
        <div className="h-3 w-2/3 max-w-md bg-muted rounded mt-2" />
      </div>

      {/* Details card skeleton */}
      <div className="val-card">
        <div className="h-4 w-40 bg-muted rounded" />
        <div className="space-y-3 mt-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex justify-between">
              <div className="h-3 w-32 bg-muted rounded" />
              <div className="h-3 w-20 bg-muted rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* Methodology skeleton */}
      <div className="val-card">
        <div className="h-4 w-28 bg-muted rounded" />
        <div className="space-y-2 mt-4">
          <div className="h-3 w-full bg-muted rounded" />
          <div className="h-3 w-5/6 bg-muted rounded" />
          <div className="h-3 w-4/6 bg-muted rounded" />
        </div>
      </div>
    </div>
  );
}
