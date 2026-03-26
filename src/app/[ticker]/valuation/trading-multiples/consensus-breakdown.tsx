import type { MultipleSummary } from "./data";

interface Props {
  multiples: MultipleSummary[];
  consensusFairValue: number;
  currentPrice: number;
}

export function ConsensusBreakdown({ multiples, consensusFairValue, currentPrice }: Props) {
  const available = multiples
    .filter((m) => m.fairValue !== null && m.fairValue > 0)
    .map((m) => ({ label: m.label, fairValue: m.fairValue! }))
    .sort((a, b) => a.fairValue - b.fairValue);

  if (available.length === 0 || consensusFairValue <= 0) return null;

  const midIndex = Math.floor(available.length / 2);
  const isEven = available.length % 2 === 0;
  const upside = ((consensusFairValue - currentPrice) / currentPrice) * 100;

  return (
    <div className="val-card">
      <h3 className="val-card-title">How We Derived the Consensus Fair Value</h3>

      <p className="text-sm text-muted-foreground mb-4">
        The consensus fair value is the <span className="text-foreground font-medium">median</span> of
        all {available.length} trading multiple fair values, sorted from lowest to highest.
        Using the median instead of the average prevents any single outlier from distorting the result.
      </p>

      {/* Sorted fair values */}
      <div className="space-y-1 mb-4">
        {available.map((m, i) => {
          const isMedianValue = isEven
            ? (i === midIndex - 1 || i === midIndex)
            : i === midIndex;

          return (
            <div
              key={m.label}
              className={`flex justify-between items-center py-1.5 px-3 rounded text-sm ${
                isMedianValue
                  ? "bg-primary/10 border border-primary/20"
                  : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-4 text-right text-xs">{i + 1}.</span>
                <span className={isMedianValue ? "font-semibold text-foreground" : "text-muted-foreground"}>
                  {m.label}
                </span>
                {isMedianValue && (
                  <span className="text-[10px] text-primary px-1.5 py-0.5 rounded bg-primary/10">
                    {isEven ? "median avg" : "median"}
                  </span>
                )}
              </div>
              <span className={`font-mono ${isMedianValue ? "font-semibold" : "text-muted-foreground"}`}>
                ${m.fairValue.toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Result */}
      <div className="border-t border-border pt-3 space-y-1">
        {isEven ? (
          <div className="text-xs text-muted-foreground mb-2">
            Median = average of #{midIndex} and #{midIndex + 1} values:
            (${available[midIndex - 1].fairValue.toFixed(2)} + ${available[midIndex].fairValue.toFixed(2)}) / 2
          </div>
        ) : (
          <div className="text-xs text-muted-foreground mb-2">
            Median = middle value (#{midIndex + 1} of {available.length})
          </div>
        )}

        <div className="flex justify-between items-center">
          <span className="text-sm font-semibold text-primary">Consensus Fair Value</span>
          <span className="text-lg font-bold font-mono text-primary">${consensusFairValue.toFixed(2)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">vs Market Price (${currentPrice.toFixed(2)})</span>
          <span className={`text-sm font-semibold font-mono ${upside >= 0 ? "text-green-400" : "text-red-400"}`}>
            {upside >= 0 ? "+" : ""}{upside.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}
