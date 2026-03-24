// KPI row + description for estimate charts

function accuracyStars(avgAbsMiss: number): number {
  if (avgAbsMiss <= 0.02) return 5;
  if (avgAbsMiss <= 0.05) return 4;
  if (avgAbsMiss <= 0.10) return 3;
  if (avgAbsMiss <= 0.20) return 2;
  return 1;
}

function renderStars(count: number): string {
  return "★".repeat(count) + "☆".repeat(5 - count);
}

interface EstimateKPIRowProps {
  pastCAGR: number | null;
  estCAGR: number | null;
  actualsCount: number;
  estCount: number;
  beatMissValues: number[];
  companyName: string;
  title: string;
}

export function EstimateKPIRow({
  pastCAGR,
  estCAGR,
  actualsCount,
  estCount,
  beatMissValues,
  companyName,
  title,
}: EstimateKPIRowProps) {
  const avgMiss =
    beatMissValues.length > 0
      ? beatMissValues.reduce((s, v) => s + v, 0) / beatMissValues.length
      : null;
  const avgAbsMiss =
    beatMissValues.length > 0
      ? beatMissValues.reduce((s, v) => s + Math.abs(v), 0) / beatMissValues.length
      : null;
  const stars = avgAbsMiss !== null ? accuracyStars(avgAbsMiss) : null;

  return (
    <>
      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {pastCAGR !== null && (
          <div className="rounded-lg border p-3 text-center">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">
              Past CAGR
            </div>
            <div className="text-lg font-bold font-mono">
              {(pastCAGR * 100).toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground">
              /year ({actualsCount - 1}Y)
            </div>
          </div>
        )}
        {estCAGR !== null && (
          <div className="rounded-lg border p-3 text-center">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">
              Est. CAGR
            </div>
            <div className="text-lg font-bold font-mono">
              {(estCAGR * 100).toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground">
              /year ({estCount}Y)
            </div>
          </div>
        )}
        {stars !== null && (
          <div className="rounded-lg border p-3 text-center">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">
              Accuracy
            </div>
            <div className="text-lg font-bold text-amber-500">
              {renderStars(stars)}
            </div>
            <div className="text-xs text-muted-foreground">
              {beatMissValues.length} periods
            </div>
          </div>
        )}
        {avgMiss !== null && (
          <div className="rounded-lg border p-3 text-center">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">
              Avg Surprise
            </div>
            <div
              className={`text-lg font-bold font-mono ${
                avgMiss >= 0 ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {avgMiss >= 0 ? "+" : ""}
              {(avgMiss * 100).toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground">
              {avgMiss >= 0 ? "beat" : "miss"}
            </div>
          </div>
        )}
      </div>

      {/* Description */}
      <p className="text-sm text-muted-foreground">
        {pastCAGR !== null && (
          <>
            For the last {actualsCount - 1} years, {companyName}&apos;s{" "}
            {title.toLowerCase()} CAGR is{" "}
            <span className="font-semibold text-foreground">
              {(pastCAGR * 100).toFixed(1)}%
            </span>
            .
          </>
        )}{" "}
        {estCAGR !== null && (
          <>
            The projected CAGR for the next {estCount} year
            {estCount > 1 ? "s" : ""} is{" "}
            <span className="font-semibold text-foreground">
              {(estCAGR * 100).toFixed(1)}%
            </span>
            .
          </>
        )}
      </p>
    </>
  );
}
