import type { MultipleDetail } from "./data";

interface Props {
  multiples: MultipleDetail[];
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
      <h3 className="val-card-title">Consensus Fair Value</h3>

      <p className="text-sm text-muted-foreground mb-4">
        The consensus is the <span className="text-foreground font-medium">median</span> of
        {" "}{available.length} trading multiple fair values.
      </p>

      <div className="space-y-1 mb-4">
        {available.map((m, i) => {
          const isMedianValue = isEven
            ? (i === midIndex - 1 || i === midIndex)
            : i === midIndex;

          return (
            <div
              key={m.label}
              className={`flex justify-between items-center py-1.5 px-3 rounded text-sm ${
                isMedianValue ? "bg-primary/10 border border-primary/20" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-4 text-right text-xs">{i + 1}.</span>
                <span className={isMedianValue ? "font-semibold text-foreground" : "text-muted-foreground"}>
                  {m.label}
                </span>
              </div>
              <span className={`font-mono ${isMedianValue ? "font-semibold" : "text-muted-foreground"}`}>
                ${m.fairValue.toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="border-t border-border pt-3 space-y-1">
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
